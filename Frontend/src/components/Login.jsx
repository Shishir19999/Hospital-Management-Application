import { useEffect, useState } from 'react';
import axios from 'axios';
import { Navigate, useNavigate } from 'react-router-dom';
import { API_URL } from '../api/config';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { token, login, registerFirstAdmin } = useAuth();
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    axios
      .get(`${API_URL}/auth/status`)
      .then((res) => setNeedsSetup(res.data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (token) return <Navigate to="/" replace />;

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (needsSetup) await registerFirstAdmin(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Request failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 360, margin: '20px auto' }}>
      <h2>{needsSetup ? 'Create the first admin account' : 'Login'}</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {needsSetup && (
        <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
      )}
      <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
      <input
        name="password"
        type="password"
        placeholder="Password (min 6 chars)"
        value={form.password}
        onChange={handleChange}
        required
      />
      <button type="submit">{needsSetup ? 'Create admin' : 'Login'}</button>
    </form>
  );
};

export default Login;
