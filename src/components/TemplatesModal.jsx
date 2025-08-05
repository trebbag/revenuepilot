import { useState, useEffect } from 'react';
import { getTemplates, createTemplate } from '../api.js';

function TemplatesModal({ baseTemplates, onSelect, onClose }) {
  const [templates, setTemplates] = useState(baseTemplates);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    getTemplates().then((data) => setTemplates([...baseTemplates, ...data]));
  }, [baseTemplates]);

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) return;
    try {
      const tpl = await createTemplate({ name: name.trim(), content: content.trim() });
      setTemplates((prev) => [...prev, tpl]);
      setName('');
      setContent('');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal card">
        <h3>Templates</h3>
        <ul>
          {templates.map((tpl) => (
            <li key={tpl.id || tpl.name}>
              <button
                onClick={() => onSelect(tpl.content)}
                style={{ margin: '0.25rem 0' }}
              >
                {tpl.name}
              </button>
            </li>
          ))}
        </ul>
        <h4>Create Template</h4>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', marginBottom: '0.5rem' }}
        />
        <textarea
          placeholder="Content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          style={{ width: '100%' }}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={handleCreate} disabled={!name.trim() || !content.trim()}>
            Save
          </button>
          <button onClick={onClose} style={{ marginLeft: '0.5rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplatesModal;
