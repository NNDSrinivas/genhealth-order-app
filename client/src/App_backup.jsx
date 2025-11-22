import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [orders, setOrders] = useState([]);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    description: '',
  });
  const [file, setFile] = useState(null);
  const [extracted, setExtracted] = useState(null);

  // Fetch orders from the API
  const fetchOrders = async () => {
    try {
      const response = await fetch('/orders');
      const data = await response.json();
      setOrders(data);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const createOrder = async (e) => {
    e.preventDefault();
    try {
      await fetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setFormData({ first_name: '', last_name: '', date_of_birth: '', description: '' });
      fetchOrders();
    } catch (err) {
      console.error('Failed to create order', err);
    }
  };

  const uploadFile = async (e) => {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/extract/patient-info', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      setExtracted(data);
      setFile(null);
      fetchOrders();
    } catch (err) {
      console.error('Failed to upload file', err);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Order Management</h1>
      </div>

      <div className="card">
        <h2>Create Order</h2>
        <form onSubmit={createOrder}>
          <input
            className="input"
            name="first_name"
            placeholder="First Name"
            value={formData.first_name}
            onChange={handleChange}
          />
          <input
            className="input"
            name="last_name"
            placeholder="Last Name"
            value={formData.last_name}
            onChange={handleChange}
          />
          <input
            className="input"
            name="date_of_birth"
            placeholder="Date of Birth (MM/DD/YYYY)"
            value={formData.date_of_birth}
            onChange={handleChange}
          />
          <textarea
            className="textarea"
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleChange}
          ></textarea>
          <button type="submit" className="button">Create</button>
        </form>
      </div>

      <div className="card">
        <h2>Upload File</h2>
        <form onSubmit={uploadFile}>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            className="input"
          />
          <button type="submit" className="button">Upload & Extract</button>
        </form>
        {extracted && (
          <div style={{ marginTop: '1rem' }}>
            <h3>Extracted Information</h3>
            <p>First Name: {extracted.first_name || '-'}</p>
            <p>Last Name: {extracted.last_name || '-'}</p>
            <p>Date of Birth: {extracted.date_of_birth || '-'}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Orders</h2>
        <ul className="orders">
          {orders.map((order) => (
            <li key={order.id}>
              #{order.id} — {order.first_name || ''} {order.last_name || ''} ({order.date_of_birth || ''})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;