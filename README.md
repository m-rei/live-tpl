# live-tpl
Minimal & natural html templating engine.

There is no need for an intermediate step of transpiling a project, as its the case with the more fully fleshed frameworks like angular/react etc.

Your html file is your template and your final product: it is processed and updated in place & live!

## Directives

The following directives (html attributes) can be used for templating:

- tpl-if
- tpl-for
- tpl-model

You can use double-curly braces anywhere in the container!

Html tag attributes can be templated with square brackets!

## Getting started

Add the following <script> tag inside \<head>:

    <script src="https://m-rei.github.io/assets/js/live-tpl.min.js"></script>

Setup a central data object:

    let data = {
        'bool': false,
        'str': 'Hello There',
        'textStr': 'text',
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
Make the template container invisible, so that the customer does not see the unprocessed template.  
Pass the invisibility class name to the *initTemplate()* function.  
If it receives a class name, it will remove the class, once the first render is complete!

    <div id="app" class="invis">
        <input [type]="textStr" tpl-model="str">
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

    const tplCtx = initTemplate('#app', data, 'invis');

Once your are finished mutating your data, rerender as follows:

    function toggleBools() {
        data.bool = !data.bool;
        renderTemplate(tplCtx);
    }

## Limitations

In the tpl-for directive, when the array reference itself is referencing an array,  
the index must either be a number or a parent loop variable reference!

Using the given data...

    let data = {
        arr1: [0, 1],
        arr2: [
            [11, 22, 33],
            [77, 88, 99],
        ],
        obj: {
            someIdx: 1,
        }
    }

... valid examples:

    // example 1: arr2[0] is using number, 0, as index
    <div tpl-for="arr1; i">
        <div tpl-for="arr2[0]; j"
            {{j}}
        </div>
    </div>

    // example 2: arr2[i] is using loop variable of parent, i, as index
    <div tpl-for="arr1; i">
        <div tpl-for="arr2[i]; j"
            {{j}}
        </div>
    </div>

... invalid example:

    // [obj.someIndex] will not be resolved!
    <div tpl-for="arr1[obj.someIndex]; i">
    </div>
