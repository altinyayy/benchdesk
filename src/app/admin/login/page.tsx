import { ActionForm } from "../ActionForm";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <div className="login">
      <h1>Admin login</h1>
      <ActionForm action={loginAction} submit="Log in">
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required autoFocus />
        </label>
      </ActionForm>
    </div>
  );
}
