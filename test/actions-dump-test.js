import Alt from '../'
import { assert } from 'chai'
import Symbol from 'es-symbol'

const alt = new Alt()

alt.generateActions('one', 'two')
const test = alt.generateActions('three')
alt.generateActions('one')

alt.createActions(class FooActions {
  static displayName = 'FooActions'
  one() {}
  two() {}
})

const pojo = alt.createActions({
  displayName: 'Pojo',
  one() { },
  two() { }
})

alt.createActions({
  one() { },
  two() { }
})

alt.createAction('test', function () { })

export default {
  'actions obj'() {
    assert.isObject(alt.actions, 'actions exist')
    assert.isFunction(alt.actions.single.test, 'test exists')
    assert(Object.keys(alt.actions.single).length === 5, 'single actions contain stuff from createAction and generateActions')
    assert(Object.keys(alt.actions.FooActions).length === 2, '2 actions namespaced on FooActions')
    assert.isObject(alt.actions.Pojo, 'pojo named action exists')
    assert(Object.keys(alt.actions.Pojo).length == 2, 'pojo has 2 actions associated with it')

    assert.isDefined(alt.actions.single.three, 'three action is defined in single')

    assert.isDefined(alt.actions.Unknown.one, 'one exists in Unknown')
    assert.isDefined(alt.actions.single.one1, 'one1 was created because of a name clash')
  },
}
