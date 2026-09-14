// (d) A transparent overlay over the meal buttons ("Ate all") in the copy → targets.spec's tap() hit-test goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'd', name: 'overlay', what: 'transparent layer over the meal log buttons',
  file: 'style.css',
  anchor: null,
  replacement: '\n.log-grid { position: relative; }\n.log-grid::after { content: ""; position: absolute; inset: 0; background: transparent; }\n',
  spec: 'targets.spec.mjs', grep: 'never has a control under its header',
  marker: 'tap(Ate all) hit-test',
}))
