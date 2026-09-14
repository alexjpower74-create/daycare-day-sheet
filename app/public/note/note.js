// Parent note: /note/?t=<token>. GET /api/note/:token, polled every 60 s while open.
// A 404 or 410 removes the whole note from the page and shows only the API's own text in #note-error. Any other failure keeps
// the last note and says it could not refresh.
import { api } from '/api.js'
import { $, renderIf, poll } from '/ui.js'
import { renderNote } from '/note/render.js'

const token = new URLSearchParams(location.search).get('t')
const noteEl = $('#note')
const errorEl = $('#note-error')
const staleEl = $('#note-stale')
const printBtn = $('#print')
let poller = null

printBtn.addEventListener('click', () => window.print())

function showNote(note) {
  errorEl.hidden = true
  errorEl.textContent = ''
  staleEl.hidden = true
  noteEl.hidden = false
  printBtn.hidden = false
  $('#centre-name').textContent = note.centre_name
  document.title = `Daily note: ${note.child.name}`
  renderIf(noteEl, note, renderNote)
}

function showGone(message) {
  poller?.stop()
  noteEl.replaceChildren()
  noteEl.__sig = undefined
  noteEl.hidden = true
  staleEl.hidden = true
  printBtn.hidden = true
  errorEl.textContent = message
  errorEl.hidden = false
  document.title = 'Daily note'
  api.info().then((i) => { $('#centre-name').textContent = i.centre_name }).catch(() => {})
}

async function load() {
  if (!token) return showGone('We couldn\'t find that note. Ask the centre for a new link.')
  try {
    showNote(await api.parentNote(token))
  } catch (e) {
    if (e.status === 404 || e.status === 410) return showGone(e.message)
    if (noteEl.hidden || !noteEl.childElementCount) {
      errorEl.textContent = e.message
      errorEl.hidden = false
    } else {
      staleEl.textContent = `${e.message} Showing the note as it was.`
      staleEl.hidden = false
    }
  }
}

load()
poller = poll(load, 60_000)
