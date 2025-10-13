// Suggestion panel rendering four expandable cards.  Clicking a suggestion
// inserts it into the note editor via the onInsert callback.
//
// The component can optionally trigger backend suggestion fetching when the
// `text` prop changes.  To avoid overwhelming the backend while the user is
// typing, these calls are debounced so that only the final value after a short
// pause results in a request.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { exportFollowUp } from '../api.js';

const BOUNDARY_REGEX = /[.!?\n]/g;

function hashText(value) {
  const text = typeof value === 'string' ? value : '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function countBoundaries(value) {
  if (!value) return 0;
  const matches = value.match(BOUNDARY_REGEX);
  return matches ? matches.length : 0;
}

function shouldTriggerBoundary(previous = '', next = '') {
  if (!next || next === previous) return false;
  const prevText = previous || '';
  const nextText = next || '';
  const prevCount = countBoundaries(prevText);
  const nextCount = countBoundaries(nextText);
  if (nextCount > prevCount) return true;
  if (nextText.length > prevText.length) {
    const windowStart = Math.max(0, prevText.length - 8);
    const deltaSegment = nextText.slice(windowStart);
    const prevSegment = prevText.slice(windowStart);
    if (BOUNDARY_REGEX.test(deltaSegment) && !BOUNDARY_REGEX.test(prevSegment)) {
      return true;
    }
  }
  return false;
}

function SuggestionPanel({
  suggestions,
  settingsState,
  loading,
  className = '',
  onInsert,
  // Optional text input that, when provided with `fetchSuggestions`, will
  // trigger backend suggestion gating and fetching when boundaries are added.
  text,
  fetchSuggestions,
  gateSuggestions,
  calendarSummary,
  onSpecialtyChange: parentSpecialtyChange,
  onPayerChange: parentPayerChange,
}) {
  const { t } = useTranslation();
  const [showPublicHealth, setShowPublicHealth] = useState(true);
  const parentSpecialty = (settingsState && settingsState.specialty) || '';
  const parentPayer = (settingsState && settingsState.payer) || '';
  const [specialty, setSpecialty] = useState(parentSpecialty);
  const [payer, setPayer] = useState(parentPayer);
  const [gateState, setGateState] = useState({
    status: 'idle',
    detail: null,
    reason: null,
    raw: null,
  });
  const [autoBusy, setAutoBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [currentHash, setCurrentHash] = useState(
    hashText(typeof text === 'string' ? text : ''),
  );
  const lastCallHashRef = useRef('');
  const previousTextRef = useRef(typeof text === 'string' ? text : '');
  const lastContextRef = useRef({ specialty: parentSpecialty, payer: parentPayer });
  const gateInFlightRef = useRef(false);
  const lastAutoSignatureRef = useRef('');
  useEffect(() => {
    setSpecialty((prev) => (prev === parentSpecialty ? prev : parentSpecialty));
  }, [parentSpecialty]);
  useEffect(() => {
    setPayer((prev) => (prev === parentPayer ? prev : parentPayer));
  }, [parentPayer]);
  useEffect(() => {
    const normalized = typeof text === 'string' ? text : '';
    setCurrentHash(hashText(normalized));
  }, [text]);

  const buildContextPayload = useCallback(
    (extra = {}) => {
      const { reason: _unusedReason, ...rest } = extra || {};
      return {
        specialty,
        payer,
        ...rest,
      };
    },
    [specialty, payer],
  );

  const triggerAuto = useCallback(
    async (noteText, extra = {}) => {
      if (typeof noteText !== 'string' || !noteText.trim()) return;
      const force = Boolean(extra.force);
      const context = buildContextPayload({ intent: 'auto', ...extra });
      const signatureBase = `${hashText(noteText)}::${context.specialty || ''}::${
        context.payer || ''
      }::${context.intent || 'auto'}`;
      if (!force && signatureBase === lastAutoSignatureRef.current) return;
      if (gateInFlightRef.current && !force) return;
      lastAutoSignatureRef.current = signatureBase;

      if (!gateSuggestions) {
        if (fetchSuggestions) {
          await fetchSuggestions(noteText, context);
          lastCallHashRef.current = hashText(noteText);
        }
        return;
      }

      gateInFlightRef.current = true;
      setAutoBusy(true);
      try {
        const gateResult = await gateSuggestions(noteText, context);
        const detail =
          gateResult?.detail || gateResult?.data?.detail || gateResult?.detail || null;
        const reason =
          gateResult?.reason ||
          detail?.reason ||
          (gateResult?.data && gateResult.data.reason) ||
          null;
        const status =
          typeof gateResult?.status === 'number'
            ? gateResult.status
            : gateResult?.blocked
              ? 409
              : gateResult?.allowed
                ? 202
                : null;
        const allowed =
          gateResult?.allowed === true ||
          status === 200 ||
          status === 202 ||
          (!gateResult?.blocked && status === null);
        setGateState({ status: allowed ? 'allowed' : 'blocked', detail, reason, raw: gateResult });
        if (allowed && fetchSuggestions) {
          await fetchSuggestions(noteText, context);
          lastCallHashRef.current = hashText(noteText);
        }
      } catch (err) {
        lastAutoSignatureRef.current = '';
        setGateState({
          status: 'error',
          detail: null,
          reason: err instanceof Error ? err.message : 'error',
          raw: null,
        });
      } finally {
        gateInFlightRef.current = false;
        setAutoBusy(false);
      }
    },
    [buildContextPayload, gateSuggestions, fetchSuggestions],
  );

  useEffect(() => {
    const prev = previousTextRef.current || '';
    const next = typeof text === 'string' ? text : '';
    if (shouldTriggerBoundary(prev, next)) {
      void triggerAuto(next);
    }
    previousTextRef.current = next;
  }, [text, triggerAuto]);

  useEffect(() => {
    const prev = lastContextRef.current;
    if (prev.specialty === specialty && prev.payer === payer) return;
    lastContextRef.current = { specialty, payer };
    if (typeof text === 'string' && text.trim()) {
      void triggerAuto(text, { force: true });
    }
  }, [specialty, payer, text, triggerAuto]);

  const safeNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const gateDetail = gateState.detail || {};
  const deltaValue = safeNumber(
    gateDetail.delta ?? gateDetail.delta_chars ?? gateDetail.deltaChars ?? 0,
  );
  const manualThreshold = safeNumber(
    gateDetail.manualThreshold ??
      gateDetail.manual_threshold ??
      gateDetail.full_threshold ??
      gateDetail.manual,
  );
  const salientChange = Boolean(gateDetail.salient || gateDetail.salience);
  const contextFlip = Boolean(
    gateDetail.contextFlip || gateDetail.context_flip || gateDetail.salienceContextFlip,
  );
  const meaningfulChange =
    salientChange || contextFlip || (manualThreshold > 0 && deltaValue >= manualThreshold);
  const canRefresh = Boolean(
    meaningfulChange && currentHash && currentHash !== lastCallHashRef.current,
  );
  const refreshDisabled = manualBusy || autoBusy || loading || !canRefresh;

  const handleManualRefresh = async () => {
    if (refreshDisabled || !fetchSuggestions || typeof text !== 'string') return;
    setManualBusy(true);
    try {
      await fetchSuggestions(text, buildContextPayload({ intent: 'manual' }));
      lastCallHashRef.current = hashText(text);
      setGateState((prev) => ({ ...prev, status: 'manual' }));
    } catch (err) {
      setGateState((prev) => ({
        ...prev,
        status: 'error',
        reason: err instanceof Error ? err.message : 'error',
      }));
    } finally {
      setManualBusy(false);
    }
  };
  // suggestions: { codes: [], compliance: [], publicHealth: [], differentials: [], followUp: {interval, ics} }

  const cards = [];
  if (!settingsState || settingsState.enableCodes) {
    cards.push({
      type: 'codes',
      key: 'codes',
      title: t('suggestion.codes'),
      items: suggestions?.codes || [],
    });
  }
  if (!settingsState || settingsState.enableCompliance) {
    cards.push({
      type: 'compliance',
      key: 'compliance',
      title: t('suggestion.compliance'),
      items: suggestions?.compliance || [],
    });
  }
  if (!settingsState || settingsState.enablePublicHealth) {
    const region = settingsState?.region;
    let items = suggestions?.publicHealth || [];
    if (region) {
      items = items.filter((item) => {
        if (item && typeof item === 'object') {
          const r = item.regions || item.region;
          if (!r) return true;
          if (Array.isArray(r)) return r.includes(region);
          return r === region;
        }
        return true;
      });
    }
    cards.push({
      type: 'public-health',
      key: 'publicHealth',
      title: t('suggestion.publicHealth'),
      items: showPublicHealth ? items : [],
    });
  }
  if (!settingsState || settingsState.enableDifferentials) {
    cards.push({
      type: 'differentials',
      key: 'differentials',
      title: t('suggestion.differentials'),
      items: suggestions?.differentials || [],
    });
  }
  if (!settingsState || settingsState.enableFollowUp !== false) {
    cards.push({
      type: 'follow-up',
      key: 'followUp',
      title: t('suggestion.followUp'),
      items: suggestions?.followUp ? [suggestions.followUp] : [],
    });
  }

  const [openState, setOpenState] = useState({
    codes: true,
    compliance: true,
    publicHealth: true,
    differentials: true,
    followUp: true,
  });

  const toggleCard = (type) => {
    setOpenState((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const renderItems = (items, type) => {
    if (loading) {
      return (
        <li style={{ color: '#9AA3B2', fontStyle: 'italic' }}>
          {t('suggestion.loading')}
        </li>
      );
    }
    if (!items || items.length === 0) {
      return (
        <li style={{ color: '#9AA3B2', fontStyle: 'italic' }}>
          {t('suggestion.none')}
        </li>
      );
    }
    return items.map((item, idx) => {
      if (type === 'codes' && typeof item === 'object' && item !== null) {
        const isLive = Boolean(item.live || item.streaming);
        const text = item.rationale
          ? `${item.code} — ${item.rationale}`
          : item.code;
        return (
          <li
            key={idx}
            title={item.rationale || ''}
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(text)}
          >
            <strong
              onClick={(e) => {
                e.stopPropagation();
                if (onInsert) onInsert(text);
              }}
            >
              {item.code}
            </strong>
            {isLive ? (
              <span
                style={{
                  marginLeft: '0.5em',
                  fontSize: '0.75em',
                  color: '#2563eb',
                  textTransform: 'uppercase',
                }}
              >
                {t('suggestion.liveBadge', 'Live')}
              </span>
            ) : null}
            {item.rationale ? ` — ${item.rationale}` : ''}
            {item.upgrade_to && (
              <span
                style={{
                  marginLeft: '0.5em',
                  fontSize: '0.85em',
                  color: '#555',
                }}
              >
                {t('suggestion.upgradeTo')} {item.upgrade_to}
              </span>
            )}
            {item.upgradePath && (
              <span
                style={{
                  marginLeft: '0.5em',
                  fontSize: '0.85em',
                  color: '#555',
                }}
              >
                {t('suggestion.upgradePath')} {item.upgradePath}
              </span>
            )}
          </li>
        );
      }
      if (
        type === 'public-health' &&
        typeof item === 'object' &&
        item !== null
      ) {
        return (
          <li
            key={idx}
            title={item.reason || ''}
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(item.recommendation)}
          >
            {item.recommendation}
            {item.reason && (
              <div style={{ fontStyle: 'italic', color: '#555' }}>
                {item.reason}
              </div>
            )}
            {item.source && (
              <div style={{ fontSize: '0.85em', color: '#555' }}>
                {item.source}
                {item.evidenceLevel ? ` (${item.evidenceLevel})` : ''}
              </div>
            )}
          </li>
        );
      }
      if (
        type === 'differentials' &&
        typeof item === 'object' &&
        item !== null
      ) {
        const isValidScore =
          typeof item.score === 'number' &&
          !Number.isNaN(item.score) &&
          item.score >= 0 &&
          item.score <= 1;
        const pct = isValidScore ? Math.round(item.score * 100) : null;
        const scoreText = pct !== null ? ` — ${pct}%` : '';
        return (
          <li
            key={idx}
            title={
              pct !== null ? `${item.diagnosis} — ${pct}%` : item.diagnosis
            }
            style={{ cursor: 'pointer' }}
            onClick={() => onInsert && onInsert(item.diagnosis)}
          >
            {item.diagnosis}
            {scoreText}
          </li>
        );
      }
      if (type === 'follow-up') {
        const interval =
          typeof item === 'object' && item !== null ? item.interval : item;
        const reason =
          typeof item === 'object' && item !== null ? item.reason : null;
        const onExport = async () => {
          try {
            const ics = await exportFollowUp(
              interval,
              calendarSummary || undefined,
            );
            const href = `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`;
            const a = document.createElement('a');
            a.href = href;
            a.download = 'follow-up.ics';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } catch (err) {
            console.error('ics export error', err);
          }
        };
        return (
          <li key={idx}>
            {interval}
            {reason && (
              <div style={{ fontStyle: 'italic', color: '#555' }}>{reason}</div>
            )}
            <button onClick={onExport} style={{ marginLeft: '0.5em' }}>
              {t('suggestion.addToCalendar')}
            </button>
          </li>
        );
      }
      const isObject = typeof item === 'object' && item !== null;
      const textValue = isObject
        ? item.text ||
          item.message ||
          item.description ||
          item.code ||
          item.summary
        : item;
      const isLive = isObject && Boolean(item.live || item.streaming);
      const severity = isObject && (item.severity || item.level);
      return (
        <li
          key={idx}
          title={typeof textValue === 'string' ? textValue : undefined}
          style={{ cursor: 'pointer' }}
          onClick={() => {
            if (!onInsert) return;
            if (typeof textValue === 'string' && textValue.trim()) {
              onInsert(textValue);
            }
          }}
        >
          {typeof textValue === 'string' ? textValue : ''}
          {isLive ? (
            <span
              style={{
                marginLeft: '0.5em',
                fontSize: '0.75em',
                color: '#2563eb',
                textTransform: 'uppercase',
              }}
            >
              {t('suggestion.liveBadge', 'Live')}
            </span>
          ) : null}
          {severity ? (
            <span
              style={{
                marginLeft: '0.5em',
                fontSize: '0.75em',
                color: '#b45309',
                textTransform: 'uppercase',
              }}
            >
              {severity}
            </span>
          ) : null}
        </li>
      );
    });
  };

  const specialtyOptions = [
    '',
    'cardiology',
    'dermatology',
    'paediatrics',
    'geriatrics',
  ];
  const payerOptions = ['', 'medicare', 'medicaid', 'aetna'];

  const handleSpecialtyChange = (event) => {
    const value = event.target.value;
    setSpecialty(value);
    if (typeof parentSpecialtyChange === 'function') {
      parentSpecialtyChange(value);
    }
  };

  const handlePayerChange = (event) => {
    const value = event.target.value;
    setPayer(value);
    if (typeof parentPayerChange === 'function') {
      parentPayerChange(value);
    }
  };

  return (
    <div className={`suggestion-panel ${className}`}>
      <div className="suggestion-panel__controls">
        <label htmlFor="suggestion-specialty">
          {t('settings.specialty')}
          <select
            id="suggestion-specialty"
            value={specialty}
            onChange={handleSpecialtyChange}
          >
            {specialtyOptions.map((option) => (
              <option key={option || 'default'} value={option}>
                {option ? t(`settings.specialties.${option}`) : '--'}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="suggestion-payer">
          {t('settings.payer')}
          <select
            id="suggestion-payer"
            value={payer}
            onChange={handlePayerChange}
          >
            {payerOptions.map((option) => (
              <option key={option || 'default'} value={option}>
                {option ? t(`settings.payers.${option}`) : '--'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshDisabled}
          style={{
            alignSelf: 'flex-end',
            padding: '0.35rem 0.75rem',
            cursor: refreshDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {manualBusy
            ? t('suggestion.refreshing', 'Refreshing…')
            : t('app.refresh', 'Refresh')}
        </button>
      </div>
      {cards.map(({ type, key, title, items }) => (
        <div key={type} className={`card ${type}`}>
          <div
            className="card-header"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleCard(key)}
          >
            <strong>{title}</strong>
            {type === 'public-health' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPublicHealth((prev) => !prev);
                }}
                style={{ marginLeft: '0.5em', fontSize: '0.8em' }}
              >
                {showPublicHealth
                  ? t('app.hideSuggestions')
                  : t('app.showSuggestions')}
              </button>
            )}
            <span style={{ float: 'right' }}>
              {openState[key] ? '\u25BC' : '\u25B2'}
            </span>
          </div>
          {openState[key] && <ul>{renderItems(items, type)}</ul>}
        </div>
      ))}
    </div>
  );
}

export default SuggestionPanel;
