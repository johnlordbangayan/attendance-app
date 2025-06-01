import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Fetch profile if session changes
  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) console.error('Error fetching profile:', error.message);
      if (!profile) console.error('No profile found for user ID:', session.user.id);

      setProfile(profile || null);
      setLoading(false);
    };

    fetchProfile();
  }, [session]);

  // Handle login/signup from Auth component
  const handleLogin = (userProfile) => {
    setProfile(userProfile);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
    });
    setLoading(false);
  };

  if (!session) return <Auth onLogin={handleLogin} />;

  if (loading) return <div>Loading profile...</div>;

  if (!profile) return <div>Profile not found. Please contact admin.</div>;

  if (profile.role === 'admin') {
    return <AdminDashboard session={session} profile={profile} />;
  }

  return <Dashboard session={session} profile={profile} />;
}
