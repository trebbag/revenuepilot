import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api.js';

function TemplatesModal({ baseTemplates, onSelect, onClose }) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState(baseTemplates);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    getTemplates().then((data) => setTemplates([...baseTemplates, ...data]));
  }, [baseTemplates]);

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) return;
    try {
      if (editingId) {
        const tpl = await updateTemplate(editingId, { name: name.trim(), content: content.trim() });
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? tpl : t)));
      } else {
        const tpl = await createTemplate({ name: name.trim(), content: content.trim() });
        setTemplates((prev) => [...prev, tpl]);
      }
      setName('');
      setContent('');
      setEditingId(null);
    } catch (e) {
      console.error(e);
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
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay">
        <div className="modal card">
          <h3>{t('templatesModal.title')}</h3>
          <ul>
            {templates.map((tpl) => (
              <li key={tpl.id || tpl.name}>
                <button
                  onClick={() => onSelect(tpl.content)}
                  style={{ margin: '0.25rem 0' }}
                >
                  {tpl.name}
                </button>
                {tpl.id && (
                  <>
                    <button onClick={() => handleEdit(tpl)} style={{ marginLeft: '0.25rem' }}>
                      {t('templatesModal.edit')}
                    </button>
                    <button onClick={() => handleDelete(tpl.id)} style={{ marginLeft: '0.25rem' }}>
                      {t('templatesModal.delete')}
                    </button>
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
            <button onClick={handleSave} disabled={!name.trim() || !content.trim()}>
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
