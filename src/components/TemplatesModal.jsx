import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getPromptTemplates,
} from '../api.js';

function TemplatesModal({ baseTemplates, specialty, payer, onSelect, onClose }) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState(baseTemplates);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState(specialty || '');
  const [selectedPayer, setSelectedPayer] = useState(payer || '');
  const [specialties, setSpecialties] = useState([specialty || '']);
  const [payers, setPayers] = useState([payer || '']);

  let isAdmin = false;
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        isAdmin = JSON.parse(atob(token.split('.')[1])).role === 'admin';
      } catch {
        isAdmin = false;
      }
    }
  }

  useEffect(() => {
    getTemplates(selectedSpecialty)
      .then((data) => setTemplates([...baseTemplates, ...data]))
      .catch((e) => {
        if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
          alert(t('dashboard.accessDenied'));
          localStorage.removeItem('token');
          window.location.href = '/';
        } else {
          setError(e.message);
        }
      });
  }, [baseTemplates, selectedSpecialty, selectedPayer]);

  useEffect(() => {
    if (!isAdmin) return;
    getPromptTemplates()
      .then((data) => {
        const specSet = new Set([
          '',
          ...Object.keys(data.specialty || {}),
          ...Object.keys(data.specialty_modifiers || {}),
        ]);
        setSpecialties(Array.from(specSet));
        const payerSet = new Set([
          '',
          ...Object.keys(data.payer || {}),
          ...Object.keys(data.payer_modifiers || {}),
        ]);
        setPayers(Array.from(payerSet));
      })
      .catch((e) => {
        if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
          alert(t('dashboard.accessDenied'));
          localStorage.removeItem('token');
          window.location.href = '/';
        }
      });
  }, [isAdmin, t]);

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) return;
    try {
      if (editingId) {
        const tpl = await updateTemplate(editingId, {
          name: name.trim(),
          content: content.trim(),
          specialty: selectedSpecialty,
          payer: selectedPayer,
        });
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? tpl : t)));
      } else {
        const tpl = await createTemplate({
          name: name.trim(),
          content: content.trim(),
          specialty: selectedSpecialty,
          payer: selectedPayer,
        });
        setTemplates((prev) => [...prev, tpl]);
      }
      setName('');
      setContent('');
      setEditingId(null);
    } catch (e) {
      if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
        alert(t('dashboard.accessDenied'));
        localStorage.removeItem('token');
        window.location.href = '/';
      } else {
        setError(e.message);
      }
    }
  };

  const handleEdit = (tpl) => {
    setEditingId(tpl.id);
    setName(tpl.name);
    setContent(tpl.content);
  };

  const handleDelete = async (id) => {
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      if (e.message === 'Unauthorized' && typeof window !== 'undefined') {
        alert(t('dashboard.accessDenied'));
        localStorage.removeItem('token');
        window.location.href = '/';
      } else {
        setError(e.message);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal card">
        <h3>{t('templatesModal.title')}</h3>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block' }}>{t('settings.specialty')}</label>
              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                style={{ width: '100%' }}
              >
                {specialties.map((s) => (
                  <option key={s} value={s}>
                    {s || '--'}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block' }}>{t('settings.payer')}</label>
              <select
                value={selectedPayer}
                onChange={(e) => setSelectedPayer(e.target.value)}
                style={{ width: '100%' }}
              >
                {payers.map((p) => (
                  <option key={p} value={p}>
                    {p || '--'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <ul>
          {templates.map((tpl) => (
            <li key={tpl.id || tpl.name}>
              <button
                onClick={() => onSelect(tpl.content)}
                style={{ margin: '0.25rem 0' }}
              >
                {tpl.name}
              </button>
              {(tpl.id || isAdmin) && (
                <>
                  <button
                    onClick={() => handleEdit(tpl)}
                    style={{ marginLeft: '0.25rem' }}
                  >
                    {t('templatesModal.edit')}
                  </button>
                  {tpl.id && (
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      style={{ marginLeft: '0.25rem' }}
                    >
                      {t('templatesModal.delete')}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <h4>{t('templatesModal.create')}</h4>
        <input
          type="text"
          placeholder={t('templatesModal.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', marginBottom: '0.5rem' }}
        />
        <textarea
          placeholder={t('templatesModal.content')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          style={{ width: '100%' }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
          >
            {t('templatesModal.save')}
          </button>
          <button onClick={onClose} style={{ marginLeft: '0.5rem' }}>
            {t('templatesModal.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplatesModal;
