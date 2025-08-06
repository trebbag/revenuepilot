import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { submitSurvey } from '../api.js';

/**
 * Modal survey asking providers to rate their documentation confidence.
 * Shown after exporting a note or when the user attempts to leave the app.
 */
export default function SatisfactionSurvey({ open, onClose }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(3);
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    try {
      await submitSurvey(rating, comments);
    } catch (e) {
      console.error(e);
    }
    onClose();
  };

  return (
    <div className="survey-overlay">
      <div className="survey-modal">
        <h3>{t('survey.title')}</h3>
        <p>{t('survey.question')}</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="satisfaction"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
              />
              {n}
            </label>
          ))}
        </div>
        <textarea
          placeholder={t('survey.comments')}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          style={{ width: '100%', marginTop: '0.5rem' }}
        />
        <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
          <button onClick={submit}>{t('survey.submit')}</button>
          <button onClick={onClose} style={{ marginLeft: '0.5rem' }}>
            {t('survey.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}
