import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';


export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setErrorMsg('');
  };

  const handleSignUp = async () => {
    setLoading(true);
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      setLoading(false);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setErrorMsg(signUpError.message);
      setLoading(false);
      return;
    }

    if (signUpData?.user) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: signUpData.user.id,
        full_name: fullName.trim(),
        role: 'employee',
      });

      if (insertError) {
        setErrorMsg('Error creating profile: ' + insertError.message);
        setLoading(false);
        return;
      }

      if (onLogin) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', signUpData.user.id)
          .maybeSingle();
        onLogin(profile);
      }
    }

    setLoading(false);
    alert('Signup successful! Please check your email for confirmation.');
  };

  const handleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setErrorMsg(signInError.message);
      setLoading(false);
      return;
    }

    if (signInData?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', signInData.user.id)
        .maybeSingle();
      onLogin(profile);
    }

    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">
            <h1 className='auth-title'>Attendance App</h1>
        </div>
        <h2 className="auth-subtitle">
          {isLogin ? 'Sign In' : 'Sign Up'}
        </h2>

        {!isLogin && (
          <input
            type="text"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="auth-input"
            disabled={loading}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
          disabled={loading}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-input"
          disabled={loading}
        />

        {errorMsg && <p className="auth-error">{errorMsg}</p>}

        <button
          onClick={isLogin ? handleSignIn : handleSignUp}
          disabled={loading}
          className="auth-button"
        >
          {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
        </button>

        <p className="auth-toggle-text">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              resetForm();
            }}
            className="auth-toggle-button"
            disabled={loading}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
