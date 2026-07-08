import { describe, it, expect } from 'vitest'
import { Formio } from '@formio/js'
import { registerBuilderComponents, setCredentialTemplates } from '../builderComponents'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Walk an editForm result to find a settings field by key (tabs → components → ...).
function findByKey(node: any, key: string): any {
  if (!node || typeof node !== 'object') return undefined
  if (node.key === key) return node
  const kids = Array.isArray(node.components) ? node.components : []
  for (const c of kids) {
    const hit = findByKey(c, key)
    if (hit) return hit
  }
  return undefined
}

describe('Inji Verification field tab', () => {
  it('injects an Inji tab with nested properties.* keys into a stock textfield', () => {
    setCredentialTemplates([{ id: 'farmer-sdjwt-v1', claimLabel: 'Farmer' }])
    registerBuilderComponents()

    const TextField: any = (Formio as any).Components.components.textfield
    const form = TextField.editForm()

    // The Inji tab is present at the top (tabs) level.
    const injiTab = (form.components as any[]).find((c) => c && c.key === 'inji')
    expect(injiTab, 'inji tab should be appended to textfield editForm').toBeTruthy()
    expect(injiTab.label).toBe('Inji Verification')

    // The template select writes to the nested property the mobile runtime reads.
    const tplSelect = findByKey(form, 'properties.injiTemplate')
    expect(tplSelect, 'select keyed properties.injiTemplate').toBeTruthy()
    expect(tplSelect.type).toBe('select')

    // The claim-path input writes to the nested property too.
    const claimInput = findByKey(form, 'properties.injiClaimPath')
    expect(claimInput, 'textfield keyed properties.injiClaimPath').toBeTruthy()
    expect(claimInput.type).toBe('textfield')
  })

  it('populates the template dropdown from the current tenant config (read live)', () => {
    registerBuilderComponents()
    setCredentialTemplates([
      { id: 'farmer-sdjwt-v1', claimLabel: 'Farmer SD-JWT' },
      { id: 'id-card-v2' },
    ])

    const DateTime: any = (Formio as any).Components.components.datetime
    const form = DateTime.editForm()
    const sel = findByKey(form, 'properties.injiTemplate')
    expect(sel).toBeTruthy()
    const values = sel.data?.values ?? []
    expect(values).toEqual([
      { label: 'Farmer SD-JWT', value: 'farmer-sdjwt-v1' },
      { label: 'id-card-v2', value: 'id-card-v2' }, // falls back to id when no claimLabel
    ])
  })

  it('does not add the Inji tab to layout/custom components (e.g. button)', () => {
    registerBuilderComponents()
    const Button: any = (Formio as any).Components.components.button
    const form = Button.editForm?.()
    const hasInjiTab = !!(
      form &&
      Array.isArray(form.components) &&
      form.components.some((c: any) => c && c.key === 'inji')
    )
    expect(hasInjiTab).toBe(false)
  })
})
