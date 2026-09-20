// The GitHub repo this site links to. Change this one line to repoint the whole site.
window.EQC_REPO = 'brianmontanaweb/everquest-companion'
;(function () {
  var base = 'https://github.com/' + window.EQC_REPO
  var links = document.querySelectorAll('a[data-repo-path]')
  for (var i = 0; i < links.length; i++) {
    links[i].href = base + links[i].getAttribute('data-repo-path')
  }
})()
