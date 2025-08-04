// Help page component explaining how to use the RevenuePilot app.

function Help() {
  return (
    <div className="help-page" style={{ padding: '1rem', overflowY: 'auto' }}>
      <h2>Welcome to RevenuePilot</h2>
      <p>
        This short guide will walk you through the basics of using the RevenuePilot
        app.  Whether you&rsquo;re creating your first clinical note or reviewing
        analytics, the app is designed to assist you at every step.
      </p>
      <h3>Writing a Note</h3>
      <ul>
        <li>
          Use the <strong>Original Note</strong> tab to type or paste your draft clinical note.
        </li>
        <li>
          The AI suggestion panel on the right will populate codes, compliance
          alerts, public health prompts, and differential diagnoses as you type.
        </li>
        <li>
          When you&rsquo;re ready to produce a polished version, click <strong>Beautify</strong>.
          A separate <strong>Beautified Note</strong> tab will appear with a cleaned, professional
          version of your draft.  Your original text remains untouched.
        </li>
        <li>
          Use the <strong>Copy</strong> button to copy the beautified note to your clipboard for
          pasting into your EHR or another system.
        </li>
        <li>
          You can insert predefined templates from the dropdown in the toolbar (e.g., SOAP
          note, wellness visit, follow‑up).  Selecting a template replaces your draft
          with the template content and lets you fill in the sections.
        </li>
        <li>
          Enter a <strong>Patient ID</strong> in the toolbar to automatically save and
          reload drafts.  RevenuePilot stores your draft locally under that ID, so you
          can return to finish documentation later.
        </li>
      </ul>
      <h3>Viewing Analytics</h3>
      <ul>
        <li>
          Click <strong>Dashboard</strong> in the toolbar to switch to the analytics view.
        </li>
        <li>
          The dashboard shows key metrics such as average revenue per visit,
          documentation deficiency rates, and provider confidence.  These
          metrics will update as you use RevenuePilot.
        </li>
        <li>
          To return to your notes, click <strong>Back to Notes</strong> in the toolbar.
        </li>
      </ul>
      <h3>Privacy & Compliance</h3>
      <p>
        RevenuePilot takes patient privacy seriously.  Notes are de‑identified on
        your device before being sent to AI services; phone numbers, dates,
        addresses, emails and other identifiers are scrubbed to protect PHI.
      </p>
      <p>
        If you have any questions or encounter issues, please reach out to
        your project manager or support team for assistance.
      </p>
    </div>
  );
}

export default Help;