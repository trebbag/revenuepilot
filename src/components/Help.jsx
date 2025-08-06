// Help page component explaining how to use the RevenuePilot app.
import { useTranslation } from 'react-i18next';

function Help() {
  const { t } = useTranslation();
  return (
    <div className="help-page" style={{ padding: '1rem', overflowY: 'auto' }}>
      <h2>{t('help.welcomeTitle')}</h2>
      <p>{t('help.intro')}</p>
      <h3>{t('help.writingTitle')}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t('help.writing1') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.writing2') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.writing3') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.writing4') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.writing5') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.writing6') }} />
      </ul>
      <h3>{t('help.analyticsTitle')}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t('help.analytics1') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.analytics2') }} />
        <li dangerouslySetInnerHTML={{ __html: t('help.analytics3') }} />
      </ul>
      <h3>{t('help.privacyTitle')}</h3>
      <p>{t('help.privacy1')}</p>
      <p>{t('help.privacy2')}</p>
    </div>
  );
}

export default Help;
