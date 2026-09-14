// Staff sign-in shared by the room view and the staff note: the keypad, POST /api/signin, then back to the page.
import { api } from '/api.js'
import { h } from '/ui.js'
import { createKeypad } from '/keypad.js'

export function showStaffSignIn(host, { message, onSignedIn } = {}) {
  const wrap = h('div', { class: 'signin-wrap' })
  const pad = createKeypad({
    title: 'Staff sign in',
    hint: 'Enter your PIN.',
    onSubmit: async (pin) => {
      await api.signin(pin)
      pad.destroy()
      wrap.remove()
      onSignedIn()
    },
  })
  wrap.append(pad.el)
  host.replaceChildren(wrap)
  if (message) pad.showError(message)
  return pad
}
