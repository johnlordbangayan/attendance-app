import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import Webcam from 'react-webcam';
import './Dashboard.css';

export default function Dashboard({ session }) {
  const webcamRef = useRef(null);
  const [station, setStation] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState('loading');
  const [cameraOn, setCameraOn] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false); // prevents double submissions

  useEffect(() => {
    async function fetchProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single();
      if (!error) setUserProfile(data);
    }
    fetchProfile();
  }, [session.user.id]);

  const checkOpenAttendanceRecord = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('user_id', session.user.id)
      .is('time_out', null)
      .order('time_in', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking attendance:', error);
      return null;
    }
    // Additional guard: if the record is from yesterday but already has time_out, ignore
    if (data && data.time_out) {
      return null;
    }
    return data;
  };

  useEffect(() => {
    async function fetchStatus() {
      const openRecord = await checkOpenAttendanceRecord();
      if (!openRecord) setAttendanceStatus('Time In');
      else if (!openRecord.time_out) setAttendanceStatus('Time Out');
      else setAttendanceStatus('Done');
    }
    fetchStatus();
  }, []);

  const fetchAttendanceRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance')
      .select('date, time_in, time_out, station, location_in, location_out, photo_in, photo_out')
      .eq('user_id', session.user.id)
      .order('time_in', { ascending: false });
    if (!error) setRecords(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAttendanceRecords();
  }, []);

  const handleCapture = async () => {
    if (processing) return;
    if (!webcamRef.current || (attendanceStatus === 'Time In' && !station.trim())) {
      alert('Please turn on the camera and enter your Station.');
      return;
    }

    setProcessing(true);

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setProcessing(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      const locationString = `${latitude},${longitude}`;
      const imageSrc = webcamRef.current.getScreenshot();

      if (!imageSrc) {
        alert('Failed to capture image.');
        setProcessing(false);
        return;
      }

      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const fileName = `${session.user.id}_${new Date().toISOString()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('attendance-photos')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg',
        });

      if (uploadError) {
        alert('Upload failed: ' + uploadError.message);
        setProcessing(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(fileName);

      const photoUrl = publicUrlData.publicUrl;
      const openRecord = await checkOpenAttendanceRecord();
      const now = new Date();

      if (!openRecord) {
        const today = now.toISOString().split('T')[0];
        const { error: insertError } = await supabase.from('attendance').insert([{
          user_id: session.user.id,
          date: today,
          station: station.trim(),
          photo_in: photoUrl,
          location_in: locationString,
          time_in: now.toISOString(), // okay for time_in to use client time
        }]);
        if (insertError) {
          alert('Failed to save time in: ' + insertError.message);
        } else {
          alert('Time In recorded successfully!');
          setAttendanceStatus('Time Out');
        }
      } else if (!openRecord.time_out) {
        const { error: updateError } = await supabase.from('attendance')
          .update({
            photo_out: photoUrl,
            location_out: locationString,
          })
          .eq('id', openRecord.id);

        if (updateError) {
          alert('Failed to update photo/location: ' + updateError.message);
          setProcessing(false);
          return;
        }

        const { error: rpcError } = await supabase.rpc('update_time_out', {
          attendance_id: openRecord.id,
        });

        if (rpcError) {
          alert('Failed to save time out: ' + rpcError.message);
        } else {
          alert('Time Out recorded successfully!');
          setAttendanceStatus('Done');
        }
      } else {
        alert('You have already timed out.');
      }

      setProcessing(false);
      fetchAttendanceRecords();
    }, (error) => {
      alert('Geolocation error: ' + error.message);
      setProcessing(false);
    });
  };


  const formatTime = (ts) => {
    if (!ts) return '-';
    const date = new Date(ts);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes} ${ampm}`;
  };

  const calcTotalHours = (start, end) => {
    if (!start || !end) return '-';
    const startTime = new Date(start);
    const endTime = new Date(end);
    if (isNaN(startTime) || isNaN(endTime)) return '-';
    let diffMs = endTime - startTime;
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
    const totalHours = diffMs / (1000 * 60 * 60);
    return totalHours.toFixed(2);
  };

  const filteredRecords = records.filter((rec) => {
    if (!rec.date) return false;
    const recordDate = new Date(rec.date);
    const today = new Date();
    const pastWeek = new Date();
    pastWeek.setDate(today.getDate() - 6);
    recordDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    pastWeek.setHours(0, 0, 0, 0);
    return recordDate <= today && recordDate >= pastWeek;
  });

  return (
    <div className="employee-dashboard-container">
      <h2 className="employee-dashboard-welcome-header">Welcome {userProfile?.full_name || session.user.email}</h2>
      <p className="employee-dashboard-role">Role: {userProfile?.role || 'employee'}</p>
      <button onClick={() => supabase.auth.signOut()} className="employee-dashboard-logout-btn">
        Log Out
      </button>

      <div className="employee-dashboard-station-input-wrapper">
        <label className="employee-dashboard-station-label">
          Station:
          <input
            type="text"
            value={station}
            onChange={(e) => setStation(e.target.value)}
            placeholder="Enter your station"
            className="employee-dashboard-station-input"
            disabled={attendanceStatus !== 'Time In'}
          />
        </label>
      </div>

      <div className="employee-dashboard-camera-section">
        {!cameraOn ? (
          <button onClick={() => setCameraOn(true)} className="employee-dashboard-start-camera-btn">
            Start Camera
          </button>
        ) : (
          <div className="employee-dashboard-camera-active">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="employee-dashboard-webcam"
              width={320}
              height={240}
              videoConstraints={{ facingMode: 'user' }}
            />
            <button
              onClick={handleCapture}
              disabled={attendanceStatus === 'loading' || attendanceStatus === 'Done' || processing}
              className={`employee-dashboard-capture-btn ${
                attendanceStatus === 'loading' || attendanceStatus === 'Done' || processing ? 'disabled' : 'enabled'
              }`}
            >
              {processing ? 'Processing...' : attendanceStatus}
            </button>
          </div>
        )}
      </div>

      <div className="employee-dashboard-report-container">
        <h3 className="employee-dashboard-report-header">Attendance Report</h3>
        {loading ? (
          <p className="employee-dashboard-loading-text">Loading records...</p>
        ) : (
          <div className="employee-dashboard-table-wrapper">
            <table className="employee-dashboard-table">
              <thead>
                <tr>
                  {['Date', 'Time In', 'Time Out', 'Total Hours', 'Station', 'Location In', 'Location Out', 'Photo In', 'Photo Out'].map((header, idx) => (
                    <th key={idx}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan="9" className="employee-dashboard-no-records">No records</td></tr>
                ) : filteredRecords.map((rec, idx) => (
                  <tr key={idx}>
                    <td>{rec.date || '-'}</td>
                    <td>{formatTime(rec.time_in)}</td>
                    <td>{formatTime(rec.time_out)}</td>
                    <td>{calcTotalHours(rec.time_in, rec.time_out)}</td>
                    <td>{rec.station}</td>
                    <td>
                      {rec.location_in ? (
                        <a href={`https://www.google.com/maps?q=${rec.location_in}`} target="_blank" rel="noreferrer">
                          {rec.location_in}
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      {rec.location_out ? (
                        <a href={`https://www.google.com/maps?q=${rec.location_out}`} target="_blank" rel="noreferrer">
                          {rec.location_out}
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      {rec.photo_in ? <img src={rec.photo_in} alt="In" className="w-16 h-12 object-cover rounded" /> : '-'}
                    </td>
                    <td>
                      {rec.photo_out ? <img src={rec.photo_out} alt="Out" className="w-16 h-12 object-cover rounded" /> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
