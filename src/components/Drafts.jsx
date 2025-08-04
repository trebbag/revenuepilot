import { useEffect, useState } from 'react';

/**
 * Drafts view component.  Lists saved drafts by patient ID and allows
 * the user to load or delete them.  Drafts are stored in localStorage
 * under keys prefixed with `draft_`.  When the component mounts, it
 * reads all such keys and builds a list of drafts with a snippet of
 * the note content.  Clicking a draft calls the provided onOpenDraft
 * handler with the patient ID.  Deleting a draft removes it from
 * localStorage and updates the list.
 */
function Drafts({ onOpenDraft }) {
  const [drafts, setDrafts] = useState([]);

  // Load drafts from localStorage on mount
  useEffect(() => {
    refreshDrafts();
  }, []);

  // Helper to refresh the drafts list from localStorage
  const refreshDrafts = () => {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('draft_')) {
        const patientID = key.substring('draft_'.length);
        const content = localStorage.getItem(key) || '';
        items.push({ patientID, snippet: content.slice(0, 100) });
      }
    }
    // Sort drafts alphabetically by patient ID for consistency
    items.sort((a, b) => a.patientID.localeCompare(b.patientID));
    setDrafts(items);
  };

  // Delete a draft from localStorage and refresh the list
  const handleDelete = (patientID) => {
    localStorage.removeItem(`draft_${patientID}`);
    refreshDrafts();
  };

  return (
    <div className="drafts-view">
      <h2>Saved Drafts</h2>
      {drafts.length === 0 ? (
        <p>No drafts saved.</p>
      ) : (
        <ul className="drafts-list">
          {drafts.map((draft) => (
            <li key={draft.patientID} className="draft-item">
              <div className="draft-info">
                <button
                  className="draft-open-btn"
                  onClick={() => onOpenDraft(draft.patientID)}
                >
                  {draft.patientID}
                </button>
                <span className="draft-snippet">{draft.snippet}{draft.snippet.length >= 100 ? '…' : ''}</span>
              </div>
              <button
                className="draft-delete-btn"
                onClick={() => handleDelete(draft.patientID)}
                title="Delete draft"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Drafts;