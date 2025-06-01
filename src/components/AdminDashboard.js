import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { saveAs } from 'file-saver';
import './AdminDashboard.css';


export default function AdminDashboard({ session, userProfile }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ name: '', station: '', startDate: '', endDate: '' });

  useEffect(() => {
    fetchRecords();
  }, [filters]);

  const fetchRecords = async () => {
    setLoading(true);
    let query = supabase
      .from('attendance')
      .select('*, profiles(full_name)')
      .order('date', { ascending: false });

    if (filters.name) query = query.ilike('profiles.full_name', `%${filters.name}%`);
    if (filters.station) query = query.ilike('station', `%${filters.station}%`);
    if (filters.startDate) query = query.gte('date', filters.startDate);
    if (filters.endDate) query = query.lte('date', filters.endDate);

    const { data, error } = await query;

    if (!error) setRecords(data);
    setLoading(false);
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
    let diffMs = endTime - startTime;
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
    return (diffMs / (1000 * 60 * 60)).toFixed(2);
  };

  const deleteField = async (id, fieldType) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete Time ${fieldType === 'in' ? 'In' : 'Out'}?`);
    if (!confirmDelete) return;

    const updateFields =
      fieldType === 'in'
        ? { time_in: null, location_in: null, photo_in: null }
        : { time_out: null, location_out: null, photo_out: null };

    const { error } = await supabase.from('attendance').update(updateFields).eq('id', id);
    if (error) return alert('Error updating record');
    fetchRecords();
  };

  const exportCSV = () => {
  // Only include records with a valid profile (i.e., filtered correctly)
  const filteredRecords = records.filter(rec => rec.profiles !== null);

  if (!filteredRecords.length) {
    alert('No records to export.');
    return;
  }

  const headers = [
    'Full Name', 'Date', 'Time In', 'Time Out', 'Total Hours',
    'Station', 'Location In', 'Location Out', 'Photo In', 'Photo Out'
  ];

  const rows = filteredRecords.map(rec => [
    rec.profiles.full_name,
    rec.date,
    formatTime(rec.time_in),
    formatTime(rec.time_out),
    calcTotalHours(rec.time_in, rec.time_out),
    rec.station || '',
    rec.location_in || '',
    rec.location_out || '',
    rec.photo_in || '',
    rec.photo_out || '',
  ]);

  const csvContent = [headers, ...rows]
    .map(e => e.map(cell => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, 'filtered_attendance_report.csv');
};


//filter fix for full name  
const filteredRecords = records.filter((rec) => {
  const fullName = rec.profiles?.full_name?.toLowerCase() || '';
  const station = rec.station?.toLowerCase() || '';
  const nameMatch = fullName.includes(filters.name.toLowerCase());
  const stationMatch = station.includes(filters.station.toLowerCase());

  const recordDate = new Date(rec.date);
  const startDate = filters.startDate ? new Date(filters.startDate) : null;
  const endDate = filters.endDate ? new Date(filters.endDate) : null;

  const dateMatch =
    (!startDate || recordDate >= startDate) &&
    (!endDate || recordDate <= endDate);

  return nameMatch && stationMatch && dateMatch;
});

  return (
    <div className="admin-dashboard-container">
      <h2 className="admin-dashboard-header">
        Admin Dashboard
      </h2>
      <p className="admin-dashboard-welcome">Welcome <span className="font-semibold">{userProfile?.full_name || session.user.email}</span></p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="admin-dashboard-logout-btn"
      >
        Log Out
      </button>

      {/* Filters */}
      <form
        className="admin-dashboard-filters"
        onSubmit={e => e.preventDefault()}
      >
        <input
          type="text"
          placeholder="Filter by name"
          value={filters.name}
          onChange={e => setFilters({ ...filters, name: e.target.value })}
          className="admin-dashboard-filters"
        />

        <input
          type="text"
          placeholder="Filter by station"
          value={filters.station}
          onChange={e => setFilters({ ...filters, station: e.target.value })}
          className="admin-dashboard-filters"
        />

        <input
          type="date"
          value={filters.startDate}
          onChange={e => setFilters({ ...filters, startDate: e.target.value })}
          className="admin-dashboard-filters"
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={e => setFilters({ ...filters, endDate: e.target.value })}
          className="admin-dashboard-filters"
        />

        <button
          onClick={exportCSV}
          type="button"
          className="admin-dashboard-filters"
        >
          Export CSV
        </button>
      </form>

      {/* Table */}
      <div className="admin-dashboard-table-wrapper">
        {loading ? (
          <p className="admin-dashboard-loading">Loading...</p>
        ) : (
          <table className="admin-dashboard-table">
            <thead className="admin-dashboard-thead">
              <tr>
                {[
                  'Full Name', 'Date', 'Time In', 'Time Out', 'Total Hours',
                  'Station', 'Location In', 'Location Out', 'Photo In', 'Photo Out', 'Actions'
                ].map((header) => (
                  <th key={header} className="admin-dashboard-th">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="admin-dashboard-table">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="11" className="admin-dashboard-no-records">No records found</td>
                </tr>
    ) : (
      filteredRecords.map((rec, idx) => (
        <tr key={rec.id} className={`admin-dashboard-tr ${idx % 2 === 0 ? 'even' : 'odd'}`}>
                    <td className="admin-dashboard-td">{rec.profiles?.full_name}</td>
                    <td className="admin-dashboard-td">{rec.date}</td>
                    <td className="admin-dashboard-td">{formatTime(rec.time_in)}</td>
                    <td className="admin-dashboard-td">{formatTime(rec.time_out)}</td>
                    <td className="admin-dashboard-td">{calcTotalHours(rec.time_in, rec.time_out)}</td>
                    <td className="admin-dashboard-td">{rec.station}</td>
                    <td className="admin-dashboard-td">
                      {rec.location_in ? (
                        <a
                          href={`https://www.google.com/maps?q=${rec.location_in}`}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-dashboard-link"
                        >
                          Map
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="admin-dashboard-td">
                      {rec.location_out ? (
                        <a
                          href={`https://www.google.com/maps?q=${rec.location_out}`}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-dashboard-link"
                        >
                          Map
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="admin-dashboard-td">
                      {rec.photo_in ? (
                        <img src={rec.photo_in} alt="In" className="admin-dashboard-img" />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="admin-dashboard-td">
                      {rec.photo_out ? (
                        <img src={rec.photo_out} alt="Out" className="admin-dashboard-img" />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="admin-dashboard-actions">
                      <button
                        onClick={() => deleteField(rec.id, 'in')}
                        className="admin-dashboard-btn admin-dashboard-btn-delete-in"
                      >
                        Delete In
                      </button>
                      <button
                        onClick={() => deleteField(rec.id, 'out')}
                        className="admin-dashboard-btn admin-dashboard-btn-delete-out"
                      >
                        Delete Out  
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
