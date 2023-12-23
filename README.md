# live-tpl
Minimal, in-place, live html templating engine

## Keywords

The following keywords can be used for templating:

- tpl-if
- tpl-for
- tpl-model

## Getting started

Setup a central data object:

    let data = {
        'bool': false,
        'str': 'Hello There',
        'obj': {
            name: 'test',
            arr: [1, 2, 3],
            nestedArr: [
                [1, 2, 3],
                [3, 6, 9],
            ]
        },
    }

Write your template!
Make sure the template container is invisible; use the exact class name given below in the example.
It will be made visible once the initial rendering has occurred during initialization.

    <div id="app" class="invisible">
        <input type="text" tpl-model="str">
        <p>text rendering: {{str}}</p>

        <button onclick="toggleBools()">toggle bools</button>
        <p>conditional rendering: <span tpl-if="bool">i am invisible</span></p>
        <p>conditional rendering: <span tpl-if="!bool">i am visible</span></p>

        <p>simple loop with following array: {{obj.arr}}</p>
        <ul>
            <li tpl-for="obj.arr; x">
                {{x}}
            </li>
        </ul>

        <p>nested loop with following array: {{obj.nestedArr}}</p>
        <ul>
            <li tpl-for="obj.nestedArr; x">
                {{x}}
                <ul>
                    <li tpl-for="x; y">
                        {{y}}
                    </li>
                </ul>
            </li>
        </ul>
    </div>

Initialize the template context as follows, providing your template container selector and your data:

    const tplCtx = initTemplate('#app', data);

Once your are finished mutating your data, rerender as follows:

    function toggleBools() {
        data.bool = !data.bool;
        renderTemplate(tplCtx);
    }