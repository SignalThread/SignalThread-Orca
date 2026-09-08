import assert from "node:assert/strict";
import test from "node:test";
import {
  getResetPasswordValidation,
  setResetPasswordField,
  type ResetPasswordValues
} from "./password-form-state";

test("confirm password value updates and mismatch is detected", () => {
  let values: ResetPasswordValues = {
    newPassword: "",
    confirmPassword: ""
  };

  values = setResetPasswordField(values, "newPassword", "password123");
  values = setResetPasswordField(values, "confirmPassword", "password12x");

  assert.equal(values.confirmPassword, "password12x");

  const mismatchState = getResetPasswordValidation(values);
  assert.equal(mismatchState.mismatchError, "Passwords do not match.");
  assert.equal(mismatchState.canSubmit, false);

  values = setResetPasswordField(values, "confirmPassword", "password123");

  const matchingState = getResetPasswordValidation(values);
  assert.equal(matchingState.mismatchError, null);
  assert.equal(matchingState.canSubmit, true);
});
