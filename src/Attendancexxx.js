// ... [imports remain unchanged]
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { CSVLink } from 'react-csv';
import './Attendance.css';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


export default function Attendance() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [location, setLocation] = useState(null);

  const [filterDate, setFilterDate] = useState('');
  const [adminStartDate, setAdminStartDate] = useState('');
  const [adminEndDate, setAdminEndDate] = useState('');
  const [adminFilterFullName, setAdminFilterFullName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attendanceType, setAttendanceType] = useState('in');
  const [confirmation, setConfirmation] = useState(null);
  const [station, setStation] = useState('');
  const [groupedRecords, setGroupedRecords] = useState({});
  const [showWeekly, setShowWeekly] = useState(false);
  const [userExportStartDate, setUserExportStartDate] = useState('');
  const [userExportEndDate, setUserExportEndDate] = useState('');
  const [attendanceData, setAttendanceData] = useState([]);

  const formatTo12Hour = (timeStr) => {
    if (!timeStr) return '';
    const [hour, minute] = timeStr.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const formattedHour = h % 12 || 12;
    return `${formattedHour}:${minute} ${ampm}`;
  };
  function calculateDuration(timeIn, timeOut) {
    if (!timeIn || !timeOut) return '-';

    const [inHour, inMinute] = timeIn.split(':').map(Number);
    const [outHour, outMinute] = timeOut.split(':').map(Number);

    const now = new Date();
    const inDate = new Date(now);
    inDate.setHours(inHour, inMinute, 0, 0);

    const outDate = new Date(now);
    outDate.setHours(outHour, outMinute, 0, 0);

    // If time out is earlier than time in, it means it's the next day
    if (outDate < inDate) {
      outDate.setDate(outDate.getDate() + 1);
    }

    const diffMs = outDate - inDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${String(diffHours).padStart(2, '0')}:${String(diffMinutes).padStart(2, '0')}`;
  }

  const groupedAdminRecords = {};

  records.forEach((r) => {
    const key = `${r.full_name}_${r.date}`;
    if (!groupedAdminRecords[key]) {
      groupedAdminRecords[key] = { full_name: r.full_name, date: r.date };
    }
    groupedAdminRecords[key][r.type] = r;
  });
    


  // Fetch current user and check role
  useEffect(() => {
    async function fetchUserAndRole() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        if (roleData?.role === 'admin') setIsAdmin(true);
      }
    }
    fetchUserAndRole();
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(`${pos.coords.latitude},${pos.coords.longitude}`),
      (err) => console.warn(`Geolocation error (${err.code}): ${err.message}`)
    );
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!user) return;

    let query = supabase
      .from('attendance_records')
      .select('*, profiles(full_name)')
      .eq('user_id', user.id);

    if (filterDate) {
      query = query.eq('date', filterDate);
    } else {
      const today = new Date();
      const past7 = new Date(today);
      past7.setDate(today.getDate() - 6);
      query = query.gte('date', past7.toISOString().split('T')[0]);
    }

    const { data } = await query.order('date', { ascending: false }).order('time', { ascending: true });
    setRecords(data || []);
  }, [user, filterDate]);

  const fetchAllRecords = useCallback(async () => {
  if (!isAdmin) return;

  let query = supabase
    .from('attendance_records')
    .select('*, profiles(full_name)')
    .order('date', { ascending: false })
    .order('time', { ascending: true });

  const { data } = await query;
  if (!data) return;

  // Client-side filtering
  let filtered = data;

  if (adminStartDate && adminEndDate) {
    filtered = filtered.filter((r) =>
      r.date >= adminStartDate && r.date <= adminEndDate
    );
  }

  if (adminFilterFullName.trim()) {
    const nameSearch = adminFilterFullName.trim().toLowerCase();
    filtered = filtered.filter((r) =>
      r.profiles?.full_name?.toLowerCase().includes(nameSearch)
    );
  }

  setAllRecords(filtered);
}, [adminFilterFullName, adminStartDate, adminEndDate, isAdmin]);

  useEffect(() => {
    const grouped = {};
    records.forEach((rec) => {
      if (!grouped[rec.date]) grouped[rec.date] = { in: null, out: null };
      grouped[rec.date][rec.type] = rec;
    });
    setGroupedRecords(grouped);
  }, [records]);

  useEffect(() => {
    if (user) {
      fetchRecords();
      if (isAdmin) fetchAllRecords();
    }
  }, [user, isAdmin, fetchRecords, fetchAllRecords]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecords();
      if (isAdmin) fetchAllRecords();
    }, 60000); // 60 seconds
    return () => clearInterval(interval);
  }, [fetchRecords, fetchAllRecords, isAdmin]);

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
            console.error('Error playing video:', e);
          }
        }
        setCameraStarted(true);
      }
    } catch (error) {
      alert('Error accessing camera: ' + error.message);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const takePhoto = () => {
    if (!user || !canvasRef.current || !videoRef.current) return;
    if (!station.trim()) return alert('Please enter your station.');

    const today = new Date().toISOString().split('T')[0];
    const alreadyTimedIn = records.some((r) => r.date === today && r.type === 'in');
const alreadyTimedOut = records.some((r) => r.date === today && r.type === 'out');

if (attendanceType === 'in' && alreadyTimedIn) {
  alert(`You have already timed IN today.`);
  return;
}

if (attendanceType === 'out') {
  if (!alreadyTimedIn) {
    alert(`You must TIME IN before you can TIME OUT.`);
    return;
  }
  if (alreadyTimedOut) {
    alert(`You have already timed OUT today.`);
    return;
  }
}


    const ctx = canvasRef.current.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);

    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;

      setLoading(true);
      const filename = `${user.id}_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('attendance-photos')
        .upload(filename, blob, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        alert('Upload error: ' + uploadError.message);
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(filename);

      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      const timeString = now.toTimeString().split(' ')[0];

      const { error: insertError } = await supabase.from('attendance_records').insert([
        {
          user_id: user.id,
          email: user.email,
          photo_url: publicUrlData.publicUrl,
          location,
          station,
          timestamp: now.toISOString(),
          date: dateString,
          time: timeString,
          type: attendanceType,
        },
      ]);

      if (insertError) {
        alert('Save error: ' + insertError.message);
      } else {
        setConfirmation(attendanceType);
        fetchRecords();
        if (isAdmin) fetchAllRecords();
        setStation('');
      }
      setLoading(false);
    }, 'image/png');
  };

  const deleteRecord = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    const { error } = await supabase.from('attendance_records').delete().eq('id', id);
    if (!error) {
      fetchRecords();
      fetchAllRecords();
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const exportAdminData = Object.values(groupedAdminRecords).map((r) => ({
    full_name: r.full_name,
    date: r.date,
    time_in: formatTo12Hour(r.in?.time),
    time_out: formatTo12Hour(r.out?.time),
    total_hours: calculateDuration(r.in?.time, r.out?.time),
    station: r.in?.station || r.out?.station || '',
    location: r.in?.location || r.out?.location || '',
    photo_url_in: r.in?.photo_url || '',
    photo_url_out: r.out?.photo_url || '',
  }));

  const adminExportHeaders = [
    { label: 'Full Name', key: 'full_name' },
    { label: 'Date', key: 'date' },
    { label: 'Time In', key: 'time_in' },
    { label: 'Time Out', key: 'time_out' },
    { label: 'Total Hours', key: 'total_hours' },
    { label: 'Station', key: 'station' },
    { label: 'Location', key: 'location' },
    { label: 'Photo URL (IN)', key: 'photo_url_in' },
    { label: 'Photo URL (OUT)', key: 'photo_url_out' },
  ];

  const userExportHeaders = [
    { label: 'Date', key: 'date' },
    { label: 'Time In', key: 'time_in' },
    { label: 'Time Out', key: 'time_out' },
    { label: 'Total Hours', key: 'total_hours' },
    { label: 'Station', key: 'station' },
    { label: 'Location', key: 'location' },
    { label: 'Photo URL (IN)', key: 'photo_url_in' },
    { label: 'Photo URL (OUT)', key: 'photo_url_out' },
  ];
  const filteredGroupedRecords = Object.entries(groupedRecords).filter(([date]) => {
    if (userExportStartDate && date < userExportStartDate) return false;
    if (userExportEndDate && date > userExportEndDate) return false;
    return true;
  });

  const exportMyData = filteredGroupedRecords.map(([date, entries]) => {
    const duration = calculateDuration(entries.in?.time, entries.out?.time);
    return {
      date,
      time_in: formatTo12Hour(entries.in?.time),
      time_out: formatTo12Hour(entries.out?.time),
      total_hours: duration,
      station: entries.in?.station || entries.out?.station || '',
      location: entries.in?.location || entries.out?.location || '',
      photo_url_in: entries.in?.photo_url || '',
      photo_url_out: entries.out?.photo_url || '',
    };
  });

const Attendance = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  
  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) {
        throw error;
      }
      setAttendanceData(prev => prev.filter((record) => record.id !== id));
      toast.success('Record deleted successfully.');
    } catch (error) {
      console.error('Delete failed:', error.message);
      toast.error('Failed to delete attendance record.');
    }
  };

  // ... rest of your component
};

  const groupedData = attendanceData.reduce((acc, record) => {
  const key = `${record.user_id}-${record.date}`;
  if (!acc[key]) {
    acc[key] = {
      user_id: record.user_id,
      full_name: record.full_name,
      date: record.date,
      in: null,
      out: null,
    };
  }

  if (record.type === 'IN') {
    acc[key].in = record;
  } else if (record.type === 'OUT') {
    acc[key].out = record;
  }

  return acc;
}, {});
  return (
    <div className="container">
      <h1>Attendance Tracker</h1>
      <button className="btn-red" onClick={logout}>Logout</button>

      <div className="camera-section">
        <video ref={videoRef} width="320" height="240" autoPlay muted playsInline />
        <canvas ref={canvasRef} width="320" height="240" hidden />
        <input
          className="station-input"
          type="text"
          placeholder="Enter your station"
          value={station}
          onChange={(e) => setStation(e.target.value)}
        />
        <select value={attendanceType} onChange={(e) => setAttendanceType(e.target.value)}>
          <option value="in">Time In</option>
          <option value="out">Time Out</option>
        </select>
        <button onClick={startCamera} className="btn-red" disabled={cameraStarted}>
          {cameraStarted ? 'Camera Started' : 'Start Camera'}
        </button>
        <button onClick={takePhoto} className="btn-red" disabled={!cameraStarted || loading}>
          {loading ? 'Saving...' : 'Take Selfie'}
        </button>
      </div>

      {confirmation && (
        <p className="confirmation">
          Successfully recorded <strong>{attendanceType.toUpperCase()}</strong>!
        </p>
      )}

      <div className="record-section">
        <h2>My Attendance</h2>
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        <label>
          <input type="checkbox" checked={showWeekly} onChange={() => setShowWeekly(!showWeekly)} />
          Group by Week
        </label>
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time In</th>
              <th>Time Out</th>
              <th>Total Hours</th>
              <th>Station</th>
              <th>Location</th>
              <th>Photo</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedRecords).map(([date, entries]) => (
              <tr key={date}>
                <td>{date}</td>
                <td>{formatTo12Hour(entries.in?.time)}</td>
                <td>{formatTo12Hour(entries.out?.time)}</td>
                <td>
                  {calculateDuration(entries.in?.time, entries.out?.time)}
                </td>
                <td>{entries.in?.station || entries.out?.station || ''}</td>
                <td>{entries.in?.location || entries.out?.location || ''}</td>
                <td>
                  {entries.in?.photo_url && (
                    <a href={entries.in.photo_url} target="_blank" rel="noopener noreferrer">IN</a>
                  )}
                </td>
                <td>
                  {entries.out?.photo_url && (
                    <a href={entries.out.photo_url} target="_blank" rel="noopener noreferrer">OUT</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="filters">
          <input
            type="date"
            value={userExportStartDate}
            onChange={(e) => setUserExportStartDate(e.target.value)}
          />
          <input
            type="date"
            value={userExportEndDate}
            onChange={(e) => setUserExportEndDate(e.target.value)}
          />
        </div>
        <CSVLink
          data={exportMyData}
          headers={userExportHeaders}
          filename={`attendance_${user?.email}.csv`}
          className="btn-red"
        >
          Export My Data CSV
        </CSVLink>
      </div>

      {isAdmin && (
        <div className="admin-section">
          <h2>Admin Attendance Records</h2>
          <div className="filters">
            <input
              type="text"
              placeholder="Filter by full name"
              value={adminFilterFullName}
              onChange={(e) => setAdminFilterFullName(e.target.value)}
            />
            <input
              type="date"
              value={adminStartDate}
              onChange={(e) => setAdminStartDate(e.target.value)}
            />
            <input
              type="date"
              value={adminEndDate}
              onChange={(e) => setAdminEndDate(e.target.value)}
            />
            <button onClick={fetchAllRecords} className="btn-red">Filter</button>
          </div>

          <table className="attendance-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Total Hours</th>
                <th>Station</th>
                <th>Location IN</th>
                <th>Location OUT</th> 
                <th>Photo IN</th>
                <th>Photo OUT</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(groupedData).map((record) => (
                <tr key={`${record.user_id}-${record.date}`}>
                  <td>{record.full_name}</td>
                  <td>{record.date}</td>
                  <td>
                    {record.in ? (
                      <>
                      {formatTo12Hour(record.in.time)}{" "}
                      <button onClick={() => handleDelete(record.in.id)}>Delete</button>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {record.out ? (
                      <>
                      {formatTo12Hour(record.out.time)}{" "}
                      <button onClick={() => handleDelete(record.out.id)}>Delete</button>
                      </>
                    ) : (
                      "-"
                    )}  
                  </td>
                  <td>{calculateDuration(record.in?.time, record.out?.time)}</td>
                  <td>{record.in?.station || record.out?.station || ''}</td>
                  <td>
                    {record.in?.location ? (
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(record.in.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        {record.in.location}
                      </a>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {record.out?.location ? (
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(record.out.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        {record.out.location}
                      </a>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {record.in?.photo_url && (
                      <a href={record.in.photo_url} target="_blank" rel="noopener noreferrer">IN</a>
                    )}
                  </td>
                  <td>
                    {record.out?.photo_url && (
                      <a href={record.out.photo_url} target="_blank" rel="noopener noreferrer">OUT</a>
                    )}
                  </td>
                  <td>
                    {record.in && (
                      <button onClick={() => handleDelete(record.in.id)} className="text-red-600">Delete IN</button>
                    )}
                    {record.out && (
                      <button onClick={() => handleDelete(record.out.id)} className="text-red-600 ml-1">Delete OUT</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <CSVLink
            data={exportAdminData}
            headers={adminExportHeaders}
            filename="admin_attendance.csv"
            className="btn-red"
          >
            Export Admin CSV
          </CSVLink>

        </div>
      )}
    </div>
  );
}
