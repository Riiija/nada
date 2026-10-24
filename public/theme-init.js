// Applique le thème avant le premier rendu pour éviter le flash.
try {
  var pref = localStorage.getItem('ged.theme') || 'system'
  var dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch (e) {}
