// This is obsolete code kept for historical reference

  /**
   * Created for AT-22
   */
  var DataValidator = global.DataValidator = function DataValidator() {
    // last validated data is the JSON string of the last data that was validated using rules
    this._lastValidatedData = '';
  };

  DataValidator.prototype.observeDataFor = function(element) {
    if (!element) {
      console.log('Can not observe data changes for <b>' + element + '</b> element');
      return;
    }
    if (element.is === 'at-core-form') {
      this.element = element;
      element.addEventListener('data-changed', this.onElementDataChanged.bind(this));
    } else if (element.is === 'at-form-complex') {
      this.element = element;
      element.addEventListener('value-changed', this.onElementDataChanged.bind(this));
    } else if (element.is === 'at-form-array') {
      this.element = element;
      element.addEventListener('value-changed', this.onFormArrayValueChanged.bind(this));
    }
  };

  DataValidator.prototype.validateComplexValue = function(complexValue, rules, element) {
    var schemaExists = Boolean(element.schema) && Boolean(element.schema.properties);
    var rulesExist = Boolean(rules) && Boolean(rules.length);
    if (!schemaExists || !rulesExist) {
      // console.log('Element <b>' + this.element + '</b> does not have any rules to validate');
      return complexValue;
    }

    var complexBusinessValue = {};
    copyProperties(Object.keys(complexValue), complexValue, complexBusinessValue);
    var self = this;

    if (!this._complexActionsAdapter) {
      this._complexActionsAdapter = this.complexActionsAdapter(element, complexBusinessValue);
    }
    var complexActionsAdapter = this._complexActionsAdapter;

    var complexValueJson = JSON.stringify(complexValue);
    if (complexValueJson !== this._lastValidatedData) {
      this._lastValidatedData = complexValueJson;

      rules.forEach(function(rule, index) {
        var ruleEngine = new RuleEngine(rule.rule);
        ruleEngine.run(complexBusinessValue, complexActionsAdapter, complexActionsAdapter.onNoTriggerOrError.bind(complexActionsAdapter));
      });
    }

    return complexBusinessValue;
  };

  function copyProperties(propertyNames, source, destination) {
    propertyNames.forEach(function(property, index) {
      destination[property] = source[property];
    });
  }


  DataValidator.prototype.validateArrayValue = function(arrayValue, rules, element) {
    var arrayBusinessValue = [];
    var i;
    var aLen = arrayValue.length;
    var businessItem;

    for (i = 0; i < aLen; i++) {
      var arrayItem = arrayValue[i];
      var propertyNames = Object.keys(arrayItem);
      businessItem = {};
      copyProperties(propertyNames, arrayItem, businessItem);
      arrayBusinessValue.push(businessItem);
    }
    var j;
    var rLen = rules.length;
    for (i = 0; i < aLen; i++) {
      businessItem = arrayBusinessValue[i];
      for (j = 0; j < rLen; j++) {
        var rule = rules[j];
        var ruleEngine = new RuleEngine(rule.rule);
        var arrayActionsAdapter = this.arrayActionsAdapter(element, businessItem, i);
        ruleEngine.run(businessItem, arrayActionsAdapter, arrayActionsAdapter.onNoTriggerOrError.bind(arrayActionsAdapter));
      }
    }

    return arrayBusinessValue;
  };

  DataValidator.prototype.arrayActionsAdapter = function(element, arrayItemValue, itemPosition) {
    var self = this;
    var formArray = element;
    var previousStates = {};

    return {
      onNoTriggerOrError: function(error, result) {
        if (error || !result) {
          // revert the changes
          var fieldIds = Object.keys(previousStates);
          fieldIds.forEach(function(fieldId, index) {
            var complex = formArray._getElementFromForm(itemPosition);
            var field = complex.getElement(fieldId);
            var previousState = previousStates[fieldId];
            var originalState = previousState.originalState;
            if (originalState === "disabled") {
              if (field.required) {
                field.required = false;
              }
              if (field.hide) {
                field.hide = false;
              }
            } else if (originalState === "required") {
              if (field.disabled) {
                field.disabled = false;
              }
              if (field.hide) {
                field.hide = false;
              }
            } else if (originalState === "hide") {
              if (field.disabled) {
                field.disabled = false;
              }
              if (field.required) {
                field.required = false;
              }
            }
            // field[previousState.changedState] = false;
            field[previousState.originalState] = true;

            field.errorMessage = '';
          });
        }
      },
      alert: function(data) {
        alert(data.message);
      },
      updateField: function(data) {
        var fieldId = data.fieldName;
        var val = data.updateTo;

        if (val === "true") {
          val = true;
        }
        if (val === "false") {
          val = false;
        }
        arrayItemValue[fieldId] = val;
      },
      setFieldState: function(data) {
        var fieldId = data.fieldName;
        var state = data.state;

        var complex = formArray._getElementFromForm(itemPosition);
        var field = complex.getElement(fieldId);

        var previousState;
        if (previousStates[fieldId] === undefined) {
          previousState = {
            originalState: '',
            changedState: ''
          };
          previousStates[fieldId] = previousState;
        } else {
          previousState = {
            originalState: '',
            changedState: ''
          };
        }

        // set the name of the changedState
        previousState.changedState = val;
        if (val === 'hidden') {
          previousState.changedState = 'hide';
        }

        if (field.disabled) {
          // previous state was disabled
          previousState.originalState = 'disabled';
        } else if (field.required) {
          // previous state was required
          previousState.originalState = 'required';
        } else if (field.hide) {
          // previous state was hide
          previousState.originalState = 'hide';
        }

        field[previousState.originalState] = false;
        if (val === "disabled") {
          field.disabled = true;
        } else if (val === "required") {
          field.required = true;
        } else if (val === "optional") {
          field[previousState.originalState] = false;
        } else if (val === "hidden") {
          field.hide = true;
        }
      },
      copyFieldValue: function(data) {
        var srcFieldId = data.fieldName;
        var destFieldId = data.copyTo;
        arrayItemValue[destFieldId] = arrayItemValue[srcFieldId];
      },
      setFieldError: function(data) {
        var fieldId = data.fieldName;
        var errorMessage = data.errorMessage;
        var complex = formArray._getElementFromForm(itemPosition);
        var field = complex.getElement(fieldId);
        if (field) {
          field.errorMessage = errorMessage;
        }
      }
    };
  };

  // this is the handler for at-core-form.data-changed and at-form-complex.value-changed
  DataValidator.prototype.onElementDataChanged = function(event) {
    if (!this.element) {
      return;
    }
    var schemaExists = Boolean(this.element.schema);
    var rulesExist = Boolean(this.element.schema.rules);
    if (!schemaExists || !rulesExist) {
      // console.log('Element <b>' + this.element + '</b> does not have any rules to validate');
      return;
    }

    if (!this.adapterForRuleObj) {
      this.adapterForRuleObj = {};
    }

    var newValue = event.detail.value;
    var newValueJsonStr = JSON.stringify(newValue);
    if (newValue !== this._lastValidatedData) {
      this._lastValidatedData = newValueJsonStr;
      // for at-core-form ruleset is in schema.rules
      var rules = this.element.schema.rules;
      // rules should be an array
      var self = this;
      rules.forEach(function(rule, index) {
        var ruleEngine = new RuleEngine(rule.rule);
        var actionsAdapter = self.adapterForRuleObj[index];
        if (actionsAdapter === undefined) {
          actionsAdapter = self.coreFormActionsAdapter(self);
          self.adapterForRuleObj[index] = actionsAdapter;
        }
        ruleEngine.run(newValue, actionsAdapter, actionsAdapter.onNoTriggerOrError.bind(actionsAdapter));
      });
    }
  };

  // this is the handler for at-form-array.value-changed
  DataValidator.prototype.onFormArrayValueChanged = function(event) {
    console.log('Not implemented yet.');
  };

  DataValidator.prototype.complexActionsAdapter = function(element, complexValue) {
    var previousStates = {};
    var coreForm = element;

    return {
      onNoTriggerOrError: function(error, result) {
        if (error || !result) {
          // revert the changes
          var fieldIds = Object.keys(previousStates);
          fieldIds.forEach(function(fieldId, index) {
            var field = coreForm.getElement(fieldId);
            var previousState = previousStates[fieldId];
            var originalState = previousState.originalState;
            if (originalState === "disabled") {
              if (field.required) {
                field.required = false;
              }
              if (field.hide) {
                field.hide = false;
              }
            } else if (originalState === "required") {
              if (field.disabled) {
                field.disabled = false;
              }
              if (field.hide) {
                field.hide = false;
              }
            } else if (originalState === "hide") {
              if (field.disabled) {
                field.disabled = false;
              }
              if (field.required) {
                field.required = false;
              }
            }
            // field[previousState.changedState] = false;
            field[previousState.originalState] = true;
          });

          fieldIds = Object.keys(complexValue);
          fieldIds.forEach(function(fieldId, index) {
            var field = coreForm.getElement(fieldId);
            if (field) {
              field.errorMessage = '';
            }
          });
        }
      },
      alert: function(data) {
        alert(data.message);
      },
      updateField: function(data) {
        var fieldId = data.fieldName;
        var val = data.updateTo;

        if (val === "true") {
          val = true;
        }
        if (val === "false") {
          val = false;
        }
        if (coreForm.updateFormElementData) {
          coreForm.updateFormElementData(fieldId, val);
        } else if (coreForm.updateFormElementValue) {
          coreForm.updateFormElementValue(fieldId, val);
        }
      },
      setFieldState: function(data) {
        var fieldId = data.fieldName;
        var val = data.state;

        var field = coreForm.getElement(fieldId);

        var previousState;
        if (previousStates[fieldId] === undefined) {
          previousState = {
            originalState: '',
            changedState: ''
          };
          previousStates[fieldId] = previousState;
        } else {
          previousState = {
            originalState: '',
            changedState: ''
          };
        }

        // set the name of the changedState
        previousState.changedState = val;
        if (val === 'hidden') {
          previousState.changedState = 'hide';
        }

        if (field.disabled) {
          // previous state was disabled
          previousState.originalState = 'disabled';
        } else if (field.required) {
          // previous state was required
          previousState.originalState = 'required';
        } else if (field.hide) {
          // previous state was hide
          previousState.originalState = 'hide';
        }

        field[previousState.originalState] = false;
        if (val === "disabled") {
          field.disabled = true;
        } else if (val === "required") {
          field.required = true;
        } else if (val === "optional") {
          field[previousState.originalState] = false;
        } else if (val === "hidden") {
          field.hide = true;
        }
      },
      copyFieldValue: function(data) {
        var srcFieldId = data.fieldName;
        var destFieldId = data.copyTo;
        var srcValue;

        if (coreForm.data) {
          srcValue = coreForm.data[srcFieldId];
          coreForm.updateFormElementData(destFieldId, srcValue);
        } else if (coreForm.value) {
          srcValue = coreForm.value[srcFieldId];
          coreForm.updateFormElementValue(destFieldId, srcValue);
        }
      },
      setFieldError: function(data) {
        var fieldId = data.fieldName;
        var errorMessage = data.errorMessage;
        var field = coreForm.getElement(fieldId);
        if (field) {
          field.errorMessage = errorMessage;
        }
      }
    };
  };

  DataValidator.prototype.coreFormActionsAdapter = function(dataValidator) {
    var self = dataValidator;
    var coreForm = self.element;
    var undoActionsList = [];

    return {
      onNoTriggerOrError: function(error, result) {
        if (error || !result) {
          // revert the changes
          undoActionsList.forEach(function(action, index) {
            if (action.execute !== undefined) {
              action.execute();
            }
          });
          undoActionsList = [];
        }
      },
      alert: function(data) {
        alert(data.message);
      },
      updateField: function(data) {
        var fieldId = data.fieldName;
        var val = data.updateTo;

        if (val === "true") {
          val = true;
        }
        if (val === "false") {
          val = false;
        }

        var field = coreForm.getElement(fieldId);
        var originalValue = field.value;
        field.value = val;

        // *ij* uncomment this when *ma* is ready for field value restoration
        // var restoreFieldValueAction = restoreFieldValueAction(field, originalValue);
        // undoActionsList.push(restoreFieldValueAction);
      },
      setFieldState: function(data) {
        var fieldId = data.fieldName;
        var val = data.state;

        var field = self.element.getElement(fieldId);
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
          undoActionsList.push(restoreFieldStateAction);
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
          undoActionsList.push(restoreFieldStateAction);
        }
      },
      copyFieldValue: function(data) {
        var srcFieldId = data.fieldName;
        var destFieldId = data.copyTo;
        if (coreForm.data) {
          var originalValue = coreForm.data[destFieldId];
          var field = coreForm.getElement(destFieldId);
          // *ij* uncomment this when *ma* is ready for field value restoration
          // var restoreFieldValueAction = RestoreFieldValueAction(field, originalValue);
          // undoActionsList.push(restoreFieldValueAction);

          var srcValue = coreForm.data[srcFieldId];
          coreForm.updateFormElementData(destFieldId, srcValue);
        }
        //  else if (self.element.value) {
        //   var srcValue = self.element.value[srcFieldId];
        //   self.element.updateFormElementValue(destFieldId, srcValue);
        // }
      },
      setFieldError: function(data) {
        var fieldId = data.fieldName;
        var errorMessage = data.errorMessage;
        var field = coreForm.getElement(fieldId);

        if (field) {
          field.errorMessage = errorMessage;

          var clearErrorMessageAction = ClearErrorMessageAction(field);
          undoActionsList.push(clearErrorMessageAction);
        }
      }
    };
  };
