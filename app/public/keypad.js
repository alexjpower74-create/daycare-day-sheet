// Shared PIN keypad. dd2 owns it; the door tablet may import it read-only.
//
//   import { createKeypad } from '/keypad.js'
//   const pad = createKeypad({ title: 'Staff sign in', hint: 'Enter your PIN.', onSubmit: async (pin) => { … } })
//   container.append(pad.el)
//
// onSubmit receives the digits; throw an Error (e.g. api.js ApiError) and its message shows in #pin-error (role="alert").
// Hooks (PLAN.md): button.key[data-key="0".."9"], #pin-enter, #pin-error. "Clear" empties the PIN. Physical digits, Backspace
// and Enter also work. Key size comes from CSS: --key-size (64 px on phones; the door can set 72 px or more).
import { h } from './ui.js'

export function createKeypad({ title, hint, onSubmit, min = 4, max = 6 } = {}) {
  let pin = ''
  let busy = false

  const dots = h('div', { class: 'pin-dots', 'aria-hidden': 'true' })
  const said = h('p', { class: 'visually-hidden', 'aria-live': 'polite' })
  const error = h('p', { id: 'pin-error', class: 'pin-error', role: 'alert' })
  const enter = h('button', { type: 'button', id: 'pin-enter', class: 'key key-enter btn-primary' }, 'Enter')
  const clear = h('button', { type: 'button', class: 'key key-clear' }, 'Clear')

  const draw = () => {
    dots.replaceChildren(...Array.from({ length: Math.max(min, pin.length) }, (_, i) =>
      h('span', { class: `pin-dot${i < pin.length ? ' on' : ''}` })))
    said.textContent = pin.length ? `${pin.length} digit${pin.length === 1 ? '' : 's'} entered` : ''
  }
  const press = (d) => {
    if (busy || pin.length >= max) return
    pin += d
    error.textContent = ''
    draw()
  }
  const reset = () => { pin = ''; draw() }
  const submit = async () => {
    if (busy) return
    if (pin.length < min) {
      error.textContent = `Enter your ${min} to ${max} digit PIN.`
      return
    }
    busy = true
    enter.disabled = true
    const tried = pin
    try {
      await onSubmit(tried)
    } catch (e) {
      error.textContent = e.message
      pin = ''
      draw()
    } finally {
      busy = false
      enter.disabled = false
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
    h('button', { type: 'button', class: 'key', 'data-key': d, onclick: () => press(d) }, d))
  clear.addEventListener('click', () => { error.textContent = ''; reset() })
  enter.addEventListener('click', submit)

  const el = h('section', { class: 'keypad', 'aria-label': title || 'PIN keypad' },
    title ? h('h1', { class: 'keypad-title' }, title) : null,
    hint ? h('p', { class: 'keypad-hint' }, hint) : null,
    dots, said,
    h('div', { class: 'keys' }, keys, clear, h('button', { type: 'button', class: 'key', 'data-key': '0', onclick: () => press('0') }, '0'), enter),
    error,
  )

  const onKey = (e) => {
    if (!el.isConnected || e.target.closest?.('input, textarea, select')) return
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault() } else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw() } else if (e.key === 'Enter') { submit(); e.preventDefault() }
  }
  document.addEventListener('keydown', onKey)
  draw()

  return {
    el,
    reset,
    showError(message) { error.textContent = message },
    destroy() { document.removeEventListener('keydown', onKey); el.remove() },
  }
}
