import { fireEvent, render } from '@testing-library/react'
import React, { Fragment, StrictMode, act, useLayoutEffect, useState } from 'react'
import {
  assertActiveComboboxOption,
  getComboboxButton,
  getComboboxInput,
  getComboboxOptions,
} from '../../test-utils/accessibility-assertions'
import { Keys, click, press } from '../../test-utils/interactions'
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from './combobox'
import { ActionTypes, ComboboxMachine } from './combobox-machine'
import { useComboboxMachineContext } from './combobox-machine-glue'

beforeAll(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(setImmediate as any)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(clearImmediate as any)
})

afterAll(() => jest.restoreAllMocks())

describe.each([false, true])('grouped option registration (StrictMode: %s)', (strict) => {
  let Wrapper = strict ? StrictMode : Fragment

  it.each([false, true])(
    'selects newly mounted options on Enter before the registration batch runs (multiple: %s)',
    async (multiple) => {
      let onChange = jest.fn()

      function Example({ options }: { options: string[] }) {
        return (
          <Wrapper>
            <Combobox multiple={multiple} onChange={onChange}>
              <ComboboxInput />
              <ComboboxButton>Open</ComboboxButton>
              <ComboboxOptions>
                <div role="group" aria-label="Fruit">
                  {options.map((value) => (
                    <ComboboxOption key={value} value={value} disabled={value === 'Apple'}>
                      {value}
                    </ComboboxOption>
                  ))}
                </div>
              </ComboboxOptions>
            </Combobox>
          </Wrapper>
        )
      }

      let { rerender } = render(<Example options={[]} />)
      await click(getComboboxButton())

      // Keep the commit and Enter in the same task so registration is still queued.
      rerender(<Example options={['Apple', 'Banana']} />)
      fireEvent.keyDown(getComboboxInput()!, Keys.Enter)
      await act(async () => {})

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(multiple ? ['Banana'] : 'Banana')
      expect(getComboboxInput()).toHaveAttribute('aria-expanded', multiple ? 'true' : 'false')
      if (multiple) assertActiveComboboxOption(getComboboxOptions()[1])
    }
  )

  it('preserves multiple selection and keyboard order while filtering across groups', async () => {
    let onChange = jest.fn()
    let groups = [
      { name: 'Sales', options: ['Revenue', 'Margin', 'Cost'] },
      { name: 'Inventory', options: ['Units', 'Weeks of supply'] },
    ]

    function Example() {
      let [value, setValue] = useState<string[]>(['Margin'])
      let [query, setQuery] = useState('')

      return (
        <Combobox
          multiple
          value={value}
          onChange={(value) => {
            setValue(value)
            onChange(value)
          }}
        >
          <ComboboxInput onChange={(event) => setQuery(event.target.value)} />
          <ComboboxButton>Open</ComboboxButton>
          <ComboboxOptions>
            {groups.map((group) => (
              <div key={group.name} role="group" aria-label={group.name}>
                <div>{group.name}</div>
                {group.options
                  .filter((option) => option.toLowerCase().includes(query.toLowerCase()))
                  .map((option) => (
                    <ComboboxOption key={option} value={option} disabled={option === 'Cost'}>
                      {option}
                    </ComboboxOption>
                  ))}
              </div>
            ))}
          </ComboboxOptions>
        </Combobox>
      )
    }

    render(
      <Wrapper>
        <Example />
      </Wrapper>
    )
    await click(getComboboxButton())
    assertActiveComboboxOption(getComboboxOptions()[1])

    await press(Keys.ArrowDown)
    assertActiveComboboxOption(getComboboxOptions()[3])

    await act(async () => {
      fireEvent.change(getComboboxInput()!, { target: { value: 'Revenue' } })
    })
    expect(getComboboxOptions().map((option) => option.textContent)).toEqual(['Revenue'])
    assertActiveComboboxOption(getComboboxOptions()[0])

    await act(async () => {
      fireEvent.change(getComboboxInput()!, { target: { value: '' } })
    })
    expect(getComboboxOptions()).toHaveLength(5)
    assertActiveComboboxOption(getComboboxOptions()[1])

    await press(Keys.ArrowDown)
    assertActiveComboboxOption(getComboboxOptions()[3])
    await press(Keys.Enter)
    expect(onChange).toHaveBeenLastCalledWith(['Margin', 'Units'])
  })

  it('coalesces 1,000 grouped mounts and 500 removals into one option update each', async () => {
    let machine!: ComboboxMachine<number>

    function Inspect() {
      let context = useComboboxMachineContext<number>('Inspect')
      useLayoutEffect(() => {
        machine = context
      }, [context])
      return null
    }

    function Example({ count }: { count: number }) {
      return (
        <Wrapper>
          <Combobox>
            <Inspect />
            <ComboboxInput />
            <ComboboxButton>Open</ComboboxButton>
            <ComboboxOptions>
              {Array.from({ length: 10 }, (_, group) => (
                <div key={group} role="group" aria-label={`Group ${group}`}>
                  <div>Group {group}</div>
                  {Array.from({ length: 100 }, (_, index) => group * 100 + index)
                    .filter((value) => value < count)
                    .map((value) => (
                      <ComboboxOption key={value} value={value}>
                        {value}
                      </ComboboxOption>
                    ))}
                </div>
              ))}
            </ComboboxOptions>
          </Combobox>
        </Wrapper>
      )
    }

    let { rerender } = render(<Example count={1000} />)
    let onOptions = jest.fn()
    let unsubscribe = machine.subscribe((state) => state.options, onOptions)
    let send = jest.spyOn(machine, 'send')

    await click(getComboboxButton())
    expect(machine.state.options).toHaveLength(1000)
    expect(onOptions).toHaveBeenCalledTimes(1)
    expect(
      send.mock.calls.filter(([event]) => event.type === ActionTypes.RegisterOptions)
    ).toHaveLength(1)

    onOptions.mockClear()
    send.mockClear()
    await act(async () => rerender(<Example count={500} />))
    expect(machine.state.options).toHaveLength(500)
    expect(onOptions).toHaveBeenCalledTimes(1)
    expect(
      send.mock.calls.filter(([event]) => event.type === ActionTypes.UnregisterOptions)
    ).toHaveLength(1)

    unsubscribe()
    send.mockRestore()
  })

  it('does not retain removed options when multiple commits occur before the batch runs', async () => {
    let machine!: ComboboxMachine<string>

    function Inspect() {
      let context = useComboboxMachineContext<string>('Inspect')
      useLayoutEffect(() => {
        machine = context
      }, [context])
      return null
    }

    function Example({ options }: { options: string[] }) {
      return (
        <Wrapper>
          <Combobox value="c">
            <Inspect />
            <ComboboxInput />
            <ComboboxOptions static>
              {options.map((value) => (
                <ComboboxOption key={value} value={value}>
                  {value}
                </ComboboxOption>
              ))}
            </ComboboxOptions>
          </Combobox>
        </Wrapper>
      )
    }

    let { rerender } = render(<Example options={['a', 'b']} />)
    rerender(<Example options={['b', 'c']} />)
    rerender(<Example options={['a', 'c']} />)
    await act(async () => {})

    expect(machine.state.options.map((option) => option.dataRef.current.value)).toEqual(['a', 'c'])
    expect(machine.state.options.map((option) => option.id)).toEqual(
      getComboboxOptions().map((option) => option.id)
    )
    assertActiveComboboxOption(getComboboxOptions()[1])
  })
})
