<!-- Google Analytics (GA4)
     Privacy: load GA only after the user grants analytics consent.
     This helps with GDPR/CCPA-style requirements (no tracking cookies until consent).
-->
<script>
(function () {
  const GA_ID = 'G-JTYVGT18JT';
  const CONSENT_KEY = 'vip_consent_analytics';

  function initGtag() {
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function loadGa() {
    // idempotent
    if (window.__vip_ga_loaded) return;
    window.__vip_ga_loaded = true;

    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    s.onload = initGtag;
    document.head.appendChild(s);
  }

  // Expose to the consent banner
  window.__vip_ga_load = loadGa;

  try {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === 'granted') {
      loadGa();
    }
  } catch (e) {
    // If storage is blocked, do nothing (no GA).
  }
})();
</script>
