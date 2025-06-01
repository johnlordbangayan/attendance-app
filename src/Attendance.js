import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { format, parseISO, differenceInHours, addDays } from 'date-fns';
import Webcam from 'react-webcam';
import { CSVLink } from 'react-csv';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const Attendance = ({ session }) => {
  const [station, setStation] = useState('');
  const [attendanceData, setAttendanceData] = useState([]);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [timeType, setTimeType] = useState('in');
  const [filterName, setFilterName] = useState('');
  const [filterStation, setFilterStation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userRole, setUserRole] = useState('');
  const webcamRef = useRef(null);

  useEffect(() => {
    fetchUserRole();
    fetchAttendance();
  }, [fetchUserRole]);

  const fetchUserRole = async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();

    if (!error) {
      setUserRole(data.role);
    }
  };

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          user_id,
          date,
          station,
          time_in,
          time_out,
          photo_in,
          photo_out,
          location_in,
          location_out,
          profiles (
            full_name
          )
        `)
        .order('date', { ascending: false });

      if (error) throw error;
      setAttendanceData(data);
    } catch (err) {
      console.error('Fetch attendance error:', err);
    }
  };

  const handleStartCamera = () => {
    setCameraStarted(true);
  };

  const handleCapture = async () => {
    if (!station) return alert('Station is required');
    if (!webcamRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot();
    const now = new Date();
    const date = format(now, 'yyyy-MM-dd');
    const time = format(now, 'HH:mm:ss');

    const location = await fetchLocation();
    const { latitude, longitude } = location.coords;
    const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    const fieldPrefix = timeType === 'in' ? 'in' : 'out';

    const { data: existing } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('date', date)
      .single();

    if (timeType === 'out' && (!existing || !existing.time_in)) {
      alert('Cannot Time Out without Time In.');
      return;
    }

    if (existing && existing[`time_${fieldPrefix}`]) {
      alert(`Already timed ${timeType} for today.`);
      return;
    }

    if (existing) {
      await supabase
        .from('attendance')
        .update({
          [`time_${fieldPrefix}`]: time,
          [`photo_${fieldPrefix}`]: imageSrc,
          [`location_${fieldPrefix}`]: locationUrl,
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('attendance').insert([{
        user_id: session.user.id,
        date,
        station,
        [`time_${fieldPrefix}`]: time,
        [`photo_${fieldPrefix}`]: imageSrc,
        [`location_${fieldPrefix}`]: locationUrl,
      }]);
    }

    fetchAttendance();
    
    setPhoto('');
    alert(`Time ${timeType.toUpperCase()} recorded.`);
  };

  const fetchLocation = () => {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject)
    );
  };

  const calculateHours = (inTime, outTime) => {
    if (!inTime || !outTime) return '';
    const inDate = parseISO(`1970-01-01T${inTime}`);
    let outDate = parseISO(`1970-01-01T${outTime}`);
    if (outDate < inDate) outDate = addDays(outDate, 1);
    return differenceInHours(outDate, inDate);
  };

  const handleDelete = async (id, field) => {
    const fieldMap = {
      in: ['time_in', 'photo_in', 'location_in'],
      out: ['time_out', 'photo_out', 'location_out']
    };

    const updates = {};
    fieldMap[field].forEach(f => (updates[f] = null));

    const { error } = await supabase.from('attendance').update(updates).eq('id', id);
    if (!error) {
      fetchAttendance();
    }
  };

  const filteredData = attendanceData.filter((item) => {
    const matchesName = item.profiles?.full_name?.toLowerCase().includes(filterName.toLowerCase());
    const matchesStation = item.station?.toLowerCase().includes(filterStation.toLowerCase());
    const dateValid =
      (!startDate || item.date >= startDate) &&
      (!endDate || item.date <= endDate);
    return matchesName && matchesStation && dateValid;
  });

  const exportPDF = () => {
    const doc = new jsPDF();
    const headers = ["Name", "Date", "Station", "Time In", "Time Out", "Total Hours"];
    const rows = filteredData.map(item => [
      item.profiles?.full_name,
      item.date,
      item.station,
      item.time_in ? format(parseISO(`1970-01-01T${item.time_in}`), 'hh:mm a') : '',
      item.time_out ? format(parseISO(`1970-01-01T${item.time_out}`), 'hh:mm a') : '',
      calculateHours(item.time_in, item.time_out),
    ]);
    doc.autoTable({ head: [headers], body: rows });
    doc.save('attendance.pdf');
  };

  return (
    <div>
      {userRole === 'employee' && (
        <div className="employee-section">
          <h2>Employee Attendance</h2>
          <input
            placeholder="Station"
            value={station}
            onChange={(e) => setStation(e.target.value)}
            required
          />
          <select value={timeType} onChange={(e) => setTimeType(e.target.value)}>
            <option value="in">Time In</option>
            <option value="out">Time Out</option>
          </select>
          <button onClick={handleStartCamera}>Start Camera</button>
          <button onClick={handleCapture} disabled={!cameraStarted}>Take Selfie</button>
          {cameraStarted && <Webcam ref={webcamRef} screenshotFormat="image/jpeg" />}
          <table align="center">
            <thead>
              <tr>
                <th>Date</th>
                <th>Station</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Total Hours</th>
                <th>Location In</th>
                <th>Location Out</th>
                <th>Photo In</th>
                <th>Photo Out</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData
                .filter((a) => a.user_id === session.user.id)
                .map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>{item.station}</td>
                    <td>{item.time_in && format(parseISO(`1970-01-01T${item.time_in}`), 'hh:mm a')}</td>
                    <td>{item.time_out && format(parseISO(`1970-01-01T${item.time_out}`), 'hh:mm a')}</td>
                    <td>{calculateHours(item.time_in, item.time_out)}</td>
                    <td>{item.location_in && <a href={item.location_in} target="_blank" rel="noreferrer">In Map</a>}</td>
                    <td>{item.location_out && <a href={item.location_out} target="_blank" rel="noreferrer">Out Map</a>}</td>
                    <td>{item.photo_in && <img src={item.photo_in} alt="" width={50} />}</td>
                    <td>{item.photo_out && <img src={item.photo_out} alt="" width={50} />}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {userRole === 'admin' && (
        <div className="admin-section">
          <h2>Admin Panel</h2>
          <input placeholder="Filter by Name" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
          <input placeholder="Filter by Station" value={filterStation} onChange={(e) => setFilterStation(e.target.value)} />
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <CSVLink data={filteredData} filename="attendance.csv">Export CSV</CSVLink>
          <button onClick={exportPDF}>Export PDF</button>

          <table align="center">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Date</th>
                <th>Station</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Total Hours</th>
                <th>Location In</th>
                <th>Location Out</th>
                <th>Photo In</th>
                <th>Photo Out</th>
                <th>Delete In</th>
                <th>Delete Out</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(item => (
                <tr key={item.id}>
                  <td>{item.profiles?.full_name}</td>
                  <td>{item.date}</td>
                  <td>{item.station}</td>
                  <td>{item.time_in && format(parseISO(`1970-01-01T${item.time_in}`), 'hh:mm a')}</td>
                  <td>{item.time_out && format(parseISO(`1970-01-01T${item.time_out}`), 'hh:mm a')}</td>
                  <td>{calculateHours(item.time_in, item.time_out)}</td>
                  <td>{item.location_in && <a href={item.location_in} target="_blank" rel="noreferrer">Map</a>}</td>
                  <td>{item.location_out && <a href={item.location_out} target="_blank" rel="noreferrer">Map</a>}</td>
                  <td>{item.photo_in && <img src={item.photo_in} alt="" width={50} />}</td>
                  <td>{item.photo_out && <img src={item.photo_out} alt="" width={50} />}</td>
                  <td><button onClick={() => handleDelete(item.id, 'in')}>Delete In</button></td>
                  <td><button onClick={() => handleDelete(item.id, 'out')}>Delete Out</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Attendance;
