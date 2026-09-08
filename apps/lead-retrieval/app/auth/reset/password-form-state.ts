export type ResetPasswordValues = {
  newPassword: string;
  confirmPassword: string;
};

export function setResetPasswordField(
  values: ResetPasswordValues,
  field: "newPassword" | "confirmPassword",
  value: string
): ResetPasswordValues {
  if (field === "newPassword") {
    return { ...values, newPassword: value };
  }
  return { ...values, confirmPassword: value };
}

export function getResetPasswordValidation(values: ResetPasswordValues) {
  const newPassword = values.newPassword;
  const confirmPassword = values.confirmPassword;
  const meetsLength = newPassword.length >= 8;
  const hasBoth = newPassword.length > 0 && confirmPassword.length > 0;
  const matches = hasBoth && newPassword === confirmPassword;
  const mismatchError = hasBoth && !matches ? "Passwords do not match." : null;
  const canSubmit = meetsLength && matches;

  return {
    meetsLength,
    matches,
    mismatchError,
    canSubmit
  };
}
