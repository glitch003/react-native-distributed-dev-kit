export default class SDKDBinder {
  generateBindings (module) {
    console.log('binding module')
    // grab all functions
    let functions = Object.getOwnPropertyNames(module.prototype)
    // filter private
    functions = functions.filter(m => m.indexOf('_') !== 0)
    
    console.log(functions)
    // functions.forEach(f => {
    //   console.log(module.prototype[f])
    //   console.log(Object.getOwnPropertyNames(module.prototype[f]))
    //   console.log(Object.getOwnPropertyDescriptor(module.prototype[f], 'arguments'))
    //   console.log('----------------')
    // })
  }
}
