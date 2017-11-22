var global = this;

(function() {
  'use strict';

  var standardOperators = {
    present: function(actual, target) {
      return !!actual;
    },
    blank: function(actual, target) {
      return !actual;
    },
    equalTo: function(actual, target) {
      return "" + actual === "" + target;
    },
    notEqualTo: function(actual, target) {
      return "" + actual !== "" + target;
    },
    greaterThan: function(actual, target) {
      return parseFloat(actual, 10) > parseFloat(target, 10);
    },
    greaterThanEqual: function(actual, target) {
      return parseFloat(actual, 10) >= parseFloat(target, 10);
    },
    lessThan: function(actual, target) {
      return parseFloat(actual, 10) < parseFloat(target, 10);
    },
    lessThanEqual: function(actual, target) {
      return parseFloat(actual, 10) <= parseFloat(target, 10);
    },
    includes: function(actual, target) {
      return ("" + actual).indexOf("" + target) > -1;
    },
    matchesRegex: function(actual, target) {
      var r = target.replace(/^\/|\/$/g, "");
      var regex = new RegExp(r);
      return regex.test("" + actual);
    },
    ifChanged: function(actual, target) {
      console.log(`ifchanged: actual ${actual}, target ${target}`);
      var result = "" + actual !== "" + target;
      return result;
    },
    ifNotChanged: function(actual, target) {
      console.log(`ifnotchanged: actual ${actual}, target ${target}`);
      var result = "" + actual === "" + target;
      return result;
    }
  };

  var RuleEngine = global.RuleEngine = function RuleEngine(rule) {
    rule = rule || {};
    this.operators = {};
    this.actions = rule.actions || [];
    this.conditions = rule.conditions || {
      kind: "all",
      conditions: []
    };
    this.addOperators(standardOperators);
  };

  RuleEngine.prototype = {
    run: function(conditionsAdapter, actionsAdapter, cb) {
      var out, error, _this = this;
      this.evaluateConditions(conditionsAdapter, function(err, result) {
        out = result;
        error = err;
        if (result && !err) _this.executeActions(actionsAdapter);
        if (cb) cb(err, result);
      });
      if (error) throw error;
      return out;
    },

    evaluateConditions: function(conditionsAdapter, cb) {
      var out, err;
      handleNode(this.conditions, conditionsAdapter, this, function(e, result) {
        if (e) {
          err = e;
          console.log("ERR", e.message, e.stack);
        }
        out = result;
        if (cb) cb(e, result);
      });
      if (err) throw err;
      if (!cb) return out;
    },

    operator: function(name) {
      return this.operators[name];
    },

    addOperators: function(newOperators) {
      var _this = this;
      for (var key in newOperators) {
        if (newOperators.hasOwnProperty(key)) {
          (function() {
            var op = newOperators[key];
            // synchronous style operator, needs to be wrapped
            if (op.length == 2) {
              _this.operators[key] = function(actual, target, cb) {
                try {
                  var result = op(actual, target);
                  cb(null, result);
                } catch (e) {
                  cb(e);
                }
              };
            }
            // asynchronous style, no wrapping needed
            else if (op.length == 3) {
              _this.operators[key] = op;
            } else {
              throw "Operators should have an arity of 2 or 3; " + key + " has " + op.length;
            }
          })();
        }
      }
    },

    executeActions: function(actionsAdapter) {
      for (var i = 0; i < this.actions.length; i++) {
        var actionData = this.actions[i];
        var actionName = actionData.actionName;
        var actionFunction = actionsAdapter[actionName];
        if (actionFunction) {
          actionFunction(actionData);
        }
      }
    }
  };

  function handleNode(node, obj, engine, cb) {
    var kind = node.kind;
    if (kind === "all" || kind === "any" || kind === "none") {
      handleConditionalNode(node, obj, engine, cb);
    } else {
      handleRuleNode(node, obj, engine, cb);
    }
  }

  function handleConditionalNode(node, obj, engine, cb) {
    try {
      var kind = node.kind;
      var isAll = kind === "all";
      var isAny = kind === "any";
      var isNone = kind === "none";
      var nodes = node.conditions;
      if (nodes.length === 0) {
        return cb(null, true);
      }
      var currentNode, i = 0;
      var next = function() {
        try {
          currentNode = nodes[i];
          i++;
          if (currentNode) {
            handleNode(currentNode, obj, engine, done);
          } else {
            // If we have gone through all of the nodes and gotten
            // here, either they have all been true (success for `all`)
            // or all false (failure for `any`);
            var r = isNone ? true : isAll;
            cb(null, r);
          }
        } catch (e) {
          cb(e);
        }
      };

      var done = function(err, result) {
        if (err) return cb(err);
        if (isAll && !result) return cb(null, false);
        if (isAny && !!result) return cb(null, true);
        if (isNone && !!result) return cb(null, false);
        next();
      };
      next();
    } catch (e) {
      cb(e);
    }
  }

  function handleRuleNode(node, obj, engine, cb) {
    try {
      var value = obj[node.name];
      if (value && value.call) {
        if (value.length === 1) {
          return value(function(result) {
            compareValues(result, node.operator, node.value, engine, cb);
          });
        } else {
          value = value();
        }
      }
      var nodeValue = node.compareTo === "field" ? obj[node.value] : node.value;
      compareValues(value, node.operator, nodeValue, engine, cb);
    } catch (e) {
      cb(e);
    }
  }

  function compareValues(actual, operator, value, engine, cb) {
    try {
      var operatorFunction = engine.operator(operator);
      if (!operatorFunction) throw "Missing " + operator + " operator";
      operatorFunction(actual, value, cb);
    } catch (e) {
      cb(e);
    }
  }

  if (typeof module !== "undefined") {
    module.exports = RuleEngine;
    delete global.RuleEngine;
  }

  /**
   * Updated code from AT-22 for AT-129
   */

   function parseBool(value) {
     var result = Boolean(value);
     // Boolean("true") = true and Boolean("false") = true because Boolean("non empty string") = true
     // so if value === "false" assign bool literal false
     result = value === "false" ? false : result;

     return result;
   }

  var RulesEvaluator = global.RulesEvaluator = function RulesEvaluator() {
    var _schema = false;
    var _values = false;
    var _ruleIndexToActionsAdapter = {};

    var _ActionsAdapter = function() {
      var _undoActionsList = [];

      return {
        /**
         * display the message in an alert
         */
        alert: function(data) {
          alert(data.message);
        },
        /**
         * update the _values object
         */
        updateField: function(data) {
          var fieldId = data.fieldName;
          var val = data.updateTo;

          if (val === "true" || val === "false") {
            val = parseBool(val);
          }

          var originalValue = _values[fieldId];
          _values[fieldId] = val;

          // *ij* uncomment this when *ma* is ready for field value restoration
          // var restoreFieldValueAction = restoreFieldValueAction(field, originalValue);
          // undoActionsList.push(restoreFieldValueAction);
        },
        /**
         * updates the state in _schema
         */
        setFieldState: function(data) {
          var fieldId = data.fieldName;
          var val = data.state;

          var field = _schema.properties[fieldId];
          var restoreFieldStateAction = false;

          if (field.disabled) {
            // previous state was disabled
            restoreFieldStateAction = RestoreFieldStateAction(field, 'disabled', true);
            field.disabled = false;
          } else if (field.required) {
            // previous state was required
            restoreFieldStateAction = RestoreFieldStateAction(field, 'required', true);
            field.required = false;
          } else if (field.hide) {
            // previous state was hide
            restoreFieldStateAction = RestoreFieldStateAction(field, 'hide', true);
            field.hide = false;
          }
          if (restoreFieldStateAction) {
            _undoActionsList.push(restoreFieldStateAction);
          }

          restoreFieldStateAction = false;
          if (val === "disabled") {
            field.disabled = true;
            restoreFieldStateAction = RestoreFieldStateAction(field, 'disabled', false);
          } else if (val === "required") {
            field.required = true;
            restoreFieldStateAction = RestoreFieldStateAction(field, 'required', false);
          } else if (val === "hidden") {
            field.hide = true;
            restoreFieldStateAction = RestoreFieldStateAction(field, 'hide', false);
          }
          if (restoreFieldStateAction) {
            _undoActionsList.push(restoreFieldStateAction);
          }
        },
        /**
         * update the _values object
         */
        copyFieldValue: function(data) {
          var srcFieldId = data.fieldName;
          var destFieldId = data.copyTo;

          var originalValue = _values[destFieldId];
          // *ij* uncomment this when *ma* is ready for field value restoration
          // var restoreFieldValueAction = RestoreFieldValueAction(field, originalValue);
          // undoActionsList.push(restoreFieldValueAction);

          var srcValue = _values[srcFieldId];
          _values[destFieldId] = srcValue;
        },
        /**
         * update the _schema object
         */
        setFieldError: function(data) {
          var fieldId = data.fieldName;
          var errorMessage = data.errorMessage;
          var field = _schema.properties[fieldId];
          
          field.errorMessage = errorMessage;

          var clearErrorMessageAction = ClearErrorMessageAction(field);
          _undoActionsList.push(clearErrorMessageAction);
        },
        /**
         * when conditions are not satisfied undo the actions
         */
        onNoTriggerOrError: function(error, result) {
          if (error || !result) {
            // revert the changes
            _undoActionsList.forEach(function(action, index) {
              if (action.execute !== undefined) {
                action.execute();
              }
            });
            _undoActionsList = [];
          }
        }
      };
    };

    // last validated data object as json string
    var _lastValidatedData = "";

    return {
      /**
       * @param schema - object that is required to contain properties
       * @param values - object that holds value for each property in schema
       * @param rules - array of {conditions, actions} objects that holds each rule that should be applied
       * @return undefined - result of execute is direct modification of schema and values objects
       */
      evaluate: function(schema, values, rules) {
        // validate parameters
        var schemaExists = Boolean(schema) && Boolean(schema.properties);
        var rulesExist = Boolean(rules) && Boolean(rules.length);
        if (!schemaExists || !rulesExist) {
          return;
        }

        _schema = schema;
        _values = values;

        var valuesJsonStr = JSON.stringify(values);
        if (valuesJsonStr !== _lastValidatedData) {
          // if values being validated are different from previous execute rules
          _lastValidatedData = valuesJsonStr;

          // for each rule create rule engine and run the conditions and actions
          rules.forEach(function (rule, index) {
            var adapter = false;
            // see if actions adapter exists for this index
            if (_ruleIndexToActionsAdapter[index] === undefined) {
              // create new adapter
              adapter = _ActionsAdapter();
              _ruleIndexToActionsAdapter[index] = adapter;
            } else {
              // use existing one
              adapter = _ruleIndexToActionsAdapter[index];
            }

            var ruleEngine = new RuleEngine(rule.rule);
            ruleEngine.run(values, adapter, adapter.onNoTriggerOrError);
          });
        }
      }
    };
  };

  var RestoreFieldValueAction = function(field, previousValue) {
    // this is the field which value should be restored
    var _field = field;
    // this is the original value of the field that should be restored
    var _previousValue = previousValue;

    return {
      execute: function() {
        _field.value = _previousValue;
      }
    };
  };

  var RestoreFieldStateAction = function(field, stateName, stateValue) {
    // this is the field which state should be restored
    var _field = field;
    // this is the value of the state should be restored
    var _stateValue = stateValue;
    // this is the name of the state that should be restored; name is one of 'required', 'disabled' or 'hide'
    var _stateName = stateName;

    return {
      execute: function() {
        _field[_stateName] = _stateValue;
      }
    };
  };

  var ClearErrorMessageAction = function(field) {
    // this is the field on which error message should be cleared
    var _field = field;

    return {
      execute: function() {
        _field.errorMessage = "";
      }
    };
  };

  global.RuleEngineUtils = {
    GetNextProperty: function (schema, data, ignoreDefaultParam) {
      var ignoreDefault = true;
      if (ignoreDefaultParam !== undefined) {
        ignoreDefault = ignoreDefaultParam;
      }

      var result = isObject(schema) && isObject(schema.properties) && isArray(schema.rules) && isObject(data);
      if (!result) { return result; }

      var dataClone = clonePlainObject(data);
      if (!ignoreDefault) {
        completeDataFromSchema(schema, dataClone);
      }

      var properties = schema.properties;
      var propNames = Object.keys(properties);
      var length = propNames.length;

      result = parseBool(length);
      if (!result) { return result; }

      var propName;
      var propDef;
      var i;
      var next = false;

      var rulesEvaluator = RulesEvaluator();
      rulesEvaluator.evaluate(schema, dataClone, schema.rules);

      for (i = 0; i < length && !next; i++) {
        propName = propNames[i];
        propDef = properties[propName];

        if (isDisabled(propDef) || isHidden(propDef)) {
          continue;
        }

        if (hasData(propName, dataClone) && isRequired(propDef)) {
          continue;
        }

        if (!hasData(propName, dataClone) || isRequired(propDef)) {
          next = propName;
        }
      }

      return next;
    }
  };

  function clonePlainObject(obj) {
    if (obj === null || obj === undefined ) {
      return obj;
    }

    var result = {};
    var propNames = Object.keys(obj);
    propNames.forEach(function (propName, index) {
      result[propName] = obj[propName];
    });
    return result;
  }

  function completeDataFromSchema(schema, data) {
    var properties = schema.properties;
    var propertyNames = Object.keys(properties);
    var propDef;
    var defValue, dataValue;

    propertyNames.forEach(function (propName, index) {
      propDef = properties[propName];

      defValue = propDef.default;
      dataValue = data[propName];

      if (notNull(defValue) && isNullOrEmpty(dataValue)) {
        data[propName] = defValue;
      }
    });
  }

  function notNull(obj) {
    return obj != null;
  }

  function isNullOrEmpty(obj) {
    return obj == null || obj === "";
  }

  function isRequired(propDef) {
    return parseBool(propDef.required) && !parseBool(propDef.hidden);
  }

  function isOptional(propDef) {
    return !isRequired(propDef);
  }

  function isDisabled(propDef) {
    return parseBool(propDef.disabled);
  }
  function isHidden(propDef) {
    return parseBool(propDef.hide);
  }

  function hasData(propName, data) {
    return data[propName] !== undefined;
  }

  function isObject(obj) {
    return Object.prototype.toString.call(obj) === "[object Object]";
  }
  function isArray(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  }
})();
