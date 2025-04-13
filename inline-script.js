(function() {
  function init() {
    var iframe = document.createElement('iframe');
    iframe.height = 1;
    iframe.width = 1;
    iframe.style.position = 'absolute';
    iframe.style.top = 0;
    iframe.style.left = 0;
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    var doc = iframe.contentDocument || iframe.contentWindow.document;
    if (doc) {
      var script = doc.createElement('script');
      script.src = '/cdn-cgi/challenge-platform/scripts/jsd/main.js';
      script.setAttribute('nonce', '');
      doc.getElementsByTagName('head')[0].appendChild(script);

      var paramsScript = doc.createElement('script');
      paramsScript.textContent = "window.__CF$cv$params={r:'92fbe183ead4457b',t:'MTc0NDU1NjkyOC4wMDAwMDA='};";
      doc.getElementsByTagName('head')[0].appendChild(paramsScript);
    }
  }

  if (document.body) {
    if ('loading' !== document.readyState) {
      init();
    } else if (window.addEventListener) {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      var oldOnReady = document.onreadystatechange || function() {};
      document.onreadystatechange = function(event) {
        oldOnReady(event);
        if ('loading' !== document.readyState) {
          document.onreadystatechange = oldOnReady;
          init();
        }
      };
    }
  }
})();