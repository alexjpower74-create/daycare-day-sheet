// (c) The copy's parent page keeps showing the last note on a 410 → note.spec's midnight check goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'c', name: 'expiry-page', what: 'parent page ignores 404/410 and keeps the last note',
  file: 'note/note.js',
  anchor: '    if (e.status === 404 || e.status === 410) return showGone(e.message)',
  replacement: '    if (e.status === 404 || e.status === 410) return // broken copy: keep whatever note is showing',
  spec: 'note.spec.mjs', grep: 'parent link on a parent phone',
  marker: '#note-error after the poll at midnight',
}))
