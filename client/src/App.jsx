import { useState, useEffect } from 'react';
import './App.css';

const TABS = {
  ORDERS: 'orders',
  ACTIVITY: 'activity',
  DELETED: 'deleted',
};

function App() {
  const [activeTab, setActiveTab] = useState(TABS.ORDERS);

  const [orders, setOrders] = useState([]);
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [logs, setLogs] = useState([]);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    description: '',
  });

  const [file, setFile] = useState(null);
  const [extracted, setExtracted] = useState({
    first_name: '-',
    last_name: '-',
    date_of_birth: '-',
    address: '-',
    phone: '-',
    used_ocr: null,
  });
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // delete confirmation state
  const [pendingDelete, setPendingDelete] = useState(null); // { id }
  const [isDeleting, setIsDeleting] = useState(false);

  // toast state
  const [toast, setToast] = useState(null); // { message, type }
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchOrders = async () => {
    try {
      const res = await fetch('/orders');
      setOrders(await res.json());
    } catch (err) {
      console.error('Failed to fetch orders', err);
    }
  };

  const fetchDeletedOrders = async () => {
    try {
      const res = await fetch('/deleted-orders');
      setDeletedOrders(await res.json());
    } catch (err) {
      console.error('Failed to fetch deleted orders', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/activity-logs?limit=50&only_api=true');
      setLogs(await res.json());
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const formatLogTime = (value) => {
    if (!value) return '';
    // Ensure UTC format for proper timezone conversion
    const utcValue = value + (value.includes('Z') ? '' : 'Z');
    const d = new Date(utcValue);
    if (Number.isNaN(d.getTime())) return value; // fallback raw string
    return d.toLocaleString('en-US', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    // initial load
    fetchOrders();
    fetchDeletedOrders();
    fetchLogs();
  }, []);

  // auto-refresh data when switching tabs
  useEffect(() => {
    if (activeTab === TABS.ACTIVITY) {
      fetchLogs();
    } else if (activeTab === TABS.DELETED) {
      fetchDeletedOrders();
    } else if (activeTab === TABS.ORDERS) {
      fetchOrders();
    }
  }, [activeTab]);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to create order');

      setFormData({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        description: '',
      });
      await fetchOrders();
      await fetchLogs();
      setToast({ message: 'Order created', type: 'success' });
    } catch (err) {
      console.error(err);
      setError('Could not create order. Please try again.');
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError('');
    console.log('🔍 FILE SELECTED:', f ? f.name : 'NO FILE');
    if (f) {
      console.log('  📄 File details:', { name: f.name, type: f.type, size: f.size });
      setToast({ message: `File selected: ${f.name}`, type: 'info' });
    }
  };

  const handleUpload = async () => {
    console.log('🚀 UPLOAD BUTTON CLICKED!');
    console.log('  📁 Current file state:', file);
    
    if (!file) {
      const msg = 'Please choose a file first.';
      setError(msg);
      setToast({ message: msg, type: 'error' });
      console.log('❌', msg);
      return;
    }
    setError('');
    setIsUploading(true);
    
    console.log('🔄 Starting upload for file:', file.name, file.type, file.size);
    
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('ocr_enabled', ocrEnabled ? 'true' : 'false');

      console.log('📡 Sending request to /extract/patient-info...');
      const res = await fetch('/extract/patient-info', {
        method: 'POST',
        body: data,
      });

      console.log('📥 Response status:', res.status, res.statusText);

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Extraction failed (${res.status})`);
      }

      const result = await res.json();
      console.log('Extraction result:', result);

      const descriptionPieces = [];
      if (result.first_name || result.last_name) {
        descriptionPieces.push(
          `Patient: ${(result.first_name || '')} ${(result.last_name || '')}`.trim()
        );
      }
      if (result.date_of_birth) descriptionPieces.push(`DOB: ${result.date_of_birth}`);
      if (result.address) descriptionPieces.push(`Address: ${result.address}`);
      if (result.phone) descriptionPieces.push(`Phone: ${result.phone}`);
      const autoDescription = descriptionPieces.join(' | ');

      setExtracted({
        first_name: result.first_name || '-',
        last_name: result.last_name || '-',
        date_of_birth: result.date_of_birth || '-',
        address: result.address || '-',
        phone: result.phone || '-',
        used_ocr: result.used_ocr,
      });

      // auto-fill create-order form
      setFormData((prev) => ({
        ...prev,
        first_name: result.first_name || '',
        last_name: result.last_name || '',
        date_of_birth: result.date_of_birth || '',
        description: autoDescription || prev.description,
      }));

      // Clear the file input after successful extraction
      setFile(null);
      // Reset file input element
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      
      await fetchOrders();
      await fetchLogs();
      setToast({
        message: result.used_ocr
          ? '📄 Document processed with OCR - Info extracted! Now click "Create Order" to save.'
          : '📄 Document processed - Info extracted! Now click "Create Order" to save.',
        type: 'info',
      });
    } catch (err) {
      console.error('Upload failed:', err);
      setError(
        err.message ||
          'Could not extract patient information. Please verify the file format.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const renderOcrBadge = () => {
    if (extracted.used_ocr === true) {
      return <span className="badge badge-ocr">OCR fallback used</span>;
    }
    if (extracted.used_ocr === false) {
      return <span className="badge badge-direct">Direct text extraction</span>;
    }
    return null;
  };

  // delete handlers
  const openDeleteConfirm = (order) => {
    setPendingDelete({ id: order.id });
  };

  const cancelDelete = () => {
    setPendingDelete(null);
    setIsDeleting(false);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError('');
    try {
      const res = await fetch(`/orders/${pendingDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || 'Failed to delete order');
      }
      await fetchOrders();
      await fetchDeletedOrders();
      await fetchLogs();
      setToast({ message: 'Order deleted', type: 'success' });
      cancelDelete();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not delete order.');
      setIsDeleting(false);
    }
  };

  // ------------------ Tabs content ------------------

  const OrdersTab = () => (
    <main className="layout">
      <section className="column">
        {/* Upload first */}
        <div className="card">
          <h2>Upload Document</h2>
          <p className="hint">
            Upload PDF, DOCX, or text files to automatically extract patient information.
          </p>

          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={ocrEnabled}
                onChange={(e) => setOcrEnabled(e.target.checked)}
              />
              <span className="toggle-slider" />
              <span className="toggle-label">
                Enable OCR fallback for scanned PDFs
              </span>
            </label>
          </div>

          <div className="upload-row">
            <input 
              type="file" 
              onChange={handleFileChange}
              style={{ border: '2px solid #007acc', padding: '8px', marginRight: '8px' }}
              accept=".pdf,.docx,.txt,.csv"
            />
            <button 
              className="button primary" 
              type="button"
              onClick={() => {
                console.log('🎯 BUTTON CLICK DETECTED!');
                handleUpload();
              }}
              disabled={isUploading}
              style={{ backgroundColor: isUploading ? '#ccc' : '#007acc', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: isUploading ? 'not-allowed' : 'pointer' }}
            >
              {isUploading ? '⏳ Uploading…' : '📤 Upload & Extract'}
            </button>
          </div>
          
          {file && (
            <div style={{ margin: '10px 0', padding: '8px', backgroundColor: '#e8f5e8', border: '1px solid #4caf50', borderRadius: '4px' }}>
              ✅ <strong>File ready:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}

          <div className="extracted">
            <div className="extracted-header">
              <h3>Extracted Information</h3>
              {renderOcrBadge()}
            </div>
            <p>
              <strong>First Name:</strong> {extracted.first_name}
            </p>
            <p>
              <strong>Last Name:</strong> {extracted.last_name}
            </p>
            <p>
              <strong>Date of Birth:</strong> {extracted.date_of_birth}
            </p>
            <p>
              <strong>Address:</strong> {extracted.address}
            </p>
            <p>
              <strong>Phone:</strong> {extracted.phone}
            </p>
          </div>

          {error && (
            <div className="error" style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '10px', border: '1px solid #ef5350', borderRadius: '4px', margin: '10px 0' }}>
              ❌ <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Create order using (optionally) extracted data */}
        <div className="card">
          <h2>Create Order</h2>
          <form onSubmit={handleCreateOrder} className="form">
            <div className="two-cols">
              <label className="field">
                <span>First Name</span>
                <input
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g. Marie"
                />
              </label>
              <label className="field">
                <span>Last Name</span>
                <input
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g. Curie"
                />
              </label>
            </div>
            <label className="field">
              <span>Date of Birth</span>
              <input
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                className="input"
                placeholder="MM/DD/YYYY"
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="textarea"
                rows={3}
                placeholder="Notes, reason for order, etc."
              />
            </label>
            <button type="submit" className="button primary">
              Create Order
            </button>
          </form>
        </div>
      </section>

      <section className="column">
        <div className="card">
          <div className="card-header-row">
            <h2>Recent Orders</h2>
            <span className="pill-count">{orders.length} total</span>
          </div>
          {orders.length === 0 ? (
            <p className="empty">No orders yet.</p>
          ) : (
            <div className="orders-grid">
              {orders.map((o) => (
                <div key={o.id} className="order-card">
                  <div className="order-card-header">
                    <span className="order-title">Order #{o.id}</span>
                    <button
                      className="icon-button danger"
                      onClick={() => openDeleteConfirm(o)}
                      aria-label="Delete order"
                      title="Delete order"
                    >
                      <span aria-hidden>🗑</span>
                    </button>
                  </div>
                  <div className="order-row">
                    <span className="order-label">👤 Name:</span>
                    <span className="order-value">
                      {o.first_name || o.last_name
                        ? `${o.first_name || ''} ${o.last_name || ''}`.trim()
                        : 'Not specified'}
                    </span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">🎂 DOB:</span>
                    <span className="order-value">
                      {o.date_of_birth || 'Not specified'}
                    </span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">📝 Description:</span>
                    <span className="order-value">
                      {o.description || 'No description'}
                    </span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">📅 Created:</span>
                    <span className="order-value">
                      {o.created_at
                        ? new Date(o.created_at + (o.created_at.includes('Z') ? '' : 'Z')).toLocaleString('en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          })
                        : 'Unknown'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );

  const ActivityTab = () => (
    <main className="single-column">
      <div className="card wide">
        <div className="card-header-row">
          <h2>Activity Logs</h2>
          <button className="button ghost" onClick={fetchLogs}>
            Refresh
          </button>
        </div>
        <p className="hint">
          Track all API requests and system activity for monitoring and debugging.
        </p>
        {logs.length === 0 ? (
          <p className="empty">No activity logged yet.</p>
        ) : (
          <ul className="list logs">
            {logs.map((log) => (
              <li key={log.id} className="list-item">
                <div className="log-line">
                  <span className={`tag method-${log.method.toLowerCase()}`}>
                    {log.method}
                  </span>
                  <code className="log-path">{log.path}</code>
                  <span className="log-status">{log.status_code}</span>
                  <button
                    type="button"
                    className="log-details-btn"
                    onClick={() =>
                      setExpandedLogId(
                        expandedLogId === log.id ? null : log.id
                      )
                    }
                  >
                    {expandedLogId === log.id ? 'Hide' : 'Details'}
                  </button>
                </div>
                <div className="log-meta">
                  <span>{formatLogTime(log.timestamp || log.created_at)}</span>
                  {log.ip_address && <span> · {log.ip_address}</span>}
                </div>
                {expandedLogId === log.id && log.body && (
                  <pre className="log-body">
                    {log.body.length > 2000
                      ? log.body.slice(0, 2000) + '…'
                      : log.body}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );

  const DeletedTab = () => (
    <main className="single-column">
      <div className="card wide">
        <div className="card-header-row">
          <h2>Deleted Orders</h2>
          <button className="button ghost" onClick={fetchDeletedOrders}>
            Refresh
          </button>
        </div>
        <p className="hint">
          Snapshot of recently deleted orders for audit and safety.
        </p>
        {deletedOrders.length === 0 ? (
          <p className="empty">No deleted orders.</p>
        ) : (
          <div className="orders-grid">
            {deletedOrders.map((o) => (
              <div key={o.id} className="order-card deleted">
                <div className="order-card-header">
                  <span className="order-title">
                    Order #{o.original_order_id}
                  </span>
                </div>
                <div className="order-row">
                  <span className="order-label">👤 Name:</span>
                  <span className="order-value">
                    {o.first_name || o.last_name
                      ? `${o.first_name || ''} ${o.last_name || ''}`.trim()
                      : 'Not specified'}
                  </span>
                </div>
                <div className="order-row">
                  <span className="order-label">🎂 DOB:</span>
                  <span className="order-value">
                    {o.date_of_birth || 'Not specified'}
                  </span>
                </div>
                <div className="order-row">
                  <span className="order-label">📝 Description:</span>
                  <span className="order-value">
                    {o.description || 'No description'}
                  </span>
                </div>
                <div className="order-row">
                  <span className="order-label">🕒 Deleted:</span>
                  <span className="order-value">
                    {new Date(o.deleted_at + (o.deleted_at.includes('Z') ? '' : 'Z')).toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );

  return (
    <div className="page">
      <header className="header">
        <div className="header-top">
          <div className="brand">
            {/* You can replace this text with the actual GenHealth.ai logo image */}
            <span className="brand-mark">●●</span>
            <span className="brand-text">GenHealth.ai</span>
          </div>
        </div>
        <p className="subtitle">
          Upload documents, extract patient info with OCR fallback, and manage recent orders.
        </p>
        <nav className="top-nav">
          <button
            className={
              activeTab === TABS.ORDERS ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setActiveTab(TABS.ORDERS)}
          >
            Orders
          </button>
          <button
            className={
              activeTab === TABS.ACTIVITY ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setActiveTab(TABS.ACTIVITY)}
          >
            Activity Logs
          </button>
          <button
            className={
              activeTab === TABS.DELETED ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setActiveTab(TABS.DELETED)}
          >
            Deleted Orders
          </button>
        </nav>
      </header>

      {activeTab === TABS.ORDERS && <OrdersTab />}
      {activeTab === TABS.ACTIVITY && <ActivityTab />}
      {activeTab === TABS.DELETED && <DeletedTab />}

      {/* Centered delete confirmation */}
      {pendingDelete && (
        <div className="confirm-banner-backdrop">
          <div className="confirm-banner">
            <div className="confirm-text">
              <strong>Delete order?</strong>
              <span>
                Are you sure you want to delete this order #{pendingDelete.id}?
              </span>
            </div>
            <div className="confirm-actions">
              <button
                className="button ghost"
                type="button"
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="button danger"
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type || 'info'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;