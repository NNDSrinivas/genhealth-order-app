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
    used_ocr: null,
  });
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [error, setError] = useState('');

  // delete confirmation state
  const [pendingDelete, setPendingDelete] = useState(null); // { id }
  const [isDeleting, setIsDeleting] = useState(false);

  // toast state
  const [toast, setToast] = useState(null); // { message, type }

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

  useEffect(() => {
    // initial load
    fetchOrders();
    fetchDeletedOrders();
    fetchLogs();
  }, []);

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
      setToast({ message: 'Order created', type: 'success' });
    } catch (err) {
      console.error(err);
      setError('Could not create order. Please try again.');
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setError('');
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('ocr_enabled', ocrEnabled ? 'true' : 'false');

      const res = await fetch('/extract/patient-info', {
        method: 'POST',
        body: data,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || 'Extraction failed');
      }

      const result = await res.json();

      setExtracted({
        first_name: result.first_name || '-',
        last_name: result.last_name || '-',
        date_of_birth: result.date_of_birth || '-',
        used_ocr: result.used_ocr,
      });

      // auto-fill create-order form
      setFormData((prev) => ({
        ...prev,
        first_name: result.first_name || '',
        last_name: result.last_name || '',
        date_of_birth: result.date_of_birth || '',
      }));

      await fetchOrders();
      setToast({
        message: result.used_ocr
          ? 'Document processed with OCR fallback'
          : 'Document processed',
        type: 'info',
      });
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          'Could not extract patient information. Please verify the file format.'
      );
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
            <input type="file" onChange={handleFileChange} />
            <button className="button primary" onClick={handleUpload}>
              Upload &amp; Extract
            </button>
          </div>

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
          </div>

          {error && <div className="error">{error}</div>}
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
                        ? new Date(o.created_at).toLocaleString()
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
                </div>
                <div className="log-meta">
                  <span>{new Date(log.created_at).toLocaleString()}</span>
                  {log.ip_address && <span> · {log.ip_address}</span>}
                </div>
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
                    {new Date(o.deleted_at).toLocaleString()}
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