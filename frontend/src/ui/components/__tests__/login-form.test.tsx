import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "../LoginForm";
import { resetI18n } from "../../../i18n/testing";

describe("LoginForm", () => {
  const user = userEvent.setup();

  afterEach(() => {
    resetI18n();
  });

  it("renders the username and password fields", () => {
    render(<LoginForm onSubmit={() => {}} isLoading={false} errorMessage={null} />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("starts with the password masked and a show toggle", () => {
    render(<LoginForm onSubmit={() => {}} isLoading={false} errorMessage={null} />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: /show password/i }),
    ).toBeInTheDocument();
  });

  it("reveals the password when the eye toggle is clicked", async () => {
    render(<LoginForm onSubmit={() => {}} isLoading={false} errorMessage={null} />);

    const password = screen.getByLabelText("Password");
    await user.type(password, "s3cret");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("submits the entered credentials", async () => {
    const onSubmit = (username: string, password: string) => {
      expect(username).toBe("nurse");
      expect(password).toBe("s3cret");
    };

    render(
      <LoginForm onSubmit={onSubmit} isLoading={false} errorMessage={null} />,
    );

    await user.type(screen.getByLabelText(/username/i), "nurse");
    await user.type(screen.getByLabelText("Password"), "s3cret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
  });
});
