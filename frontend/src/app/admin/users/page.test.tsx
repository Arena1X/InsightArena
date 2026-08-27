import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "@/lib/api";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    listAdminUsers: vi.fn(),
    banAdminUser: vi.fn(),
    unbanAdminUser: vi.fn(),
    flagAdminUser: vi.fn(),
  };
});

// WalletContext — provide a token so API helpers are called
vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    address: "GADMIN_ADDRESS",
    token: "test-admin-token",
    isAuthenticated: true,
    openConnectModal: vi.fn(),
  }),
}));

// AdminGuard — bypass auth check in unit tests
vi.mock("@/component/admin/AdminGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// useDebounce — return value immediately (no timer needed in tests)
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockListAdminUsers = vi.mocked(api.listAdminUsers);
const mockBanAdminUser = vi.mocked(api.banAdminUser);
const mockUnbanAdminUser = vi.mocked(api.unbanAdminUser);
const mockFlagAdminUser = vi.mocked(api.flagAdminUser);

function makeUser(overrides: Partial<api.AdminUser> = {}): api.AdminUser {
  return {
    id: "user-1",
    stellar_address: "GADDR1111111111111111111111111111111111111111111111111111",
    username: "alice",
    role: "user",
    reputation_score: 80,
    total_predictions: 42,
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeResponse(
  users: api.AdminUser[],
  total = users.length,
): api.PaginatedAdminUsersResponse {
  return {
    data: users,
    meta: { total, page: 1, limit: 20, totalPages: 1 },
  };
}

// Lazily import the page after mocks are in place
async function renderPage() {
  const { default: AdminUsersPage } = await import("./page");
  render(<AdminUsersPage />);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("AdminUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminUsers.mockResolvedValue(
      makeResponse([
        makeUser({ id: "user-1", username: "alice", is_banned: false }),
        makeUser({
          id: "user-2",
          username: "bob",
          stellar_address:
            "GADDR2222222222222222222222222222222222222222222222222222",
          is_banned: true,
        }),
      ]),
    );
    mockBanAdminUser.mockResolvedValue(
      makeUser({ id: "user-1", is_banned: true }),
    );
    mockUnbanAdminUser.mockResolvedValue(
      makeUser({ id: "user-2", is_banned: false }),
    );
    mockFlagAdminUser.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial render ─────────────────────────────────────────────────────────

  it("renders the page heading", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /search and moderate users/i }),
    ).toBeInTheDocument();
  });

  it("renders the search input", async () => {
    await renderPage();
    expect(
      screen.getByRole("searchbox", {
        name: /search by wallet address or username/i,
      }),
    ).toBeInTheDocument();
  });

  it("calls listAdminUsers on mount with no search term", async () => {
    await renderPage();
    await waitFor(() =>
      expect(mockListAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined, page: 1 }),
        "test-admin-token",
      ),
    );
  });

  it("displays fetched users in the table", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  // ── Search filters ─────────────────────────────────────────────────────────

  it("calls listAdminUsers with the search term when user types", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(mockListAdminUsers).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByRole("searchbox", {
      name: /search by wallet address or username/i,
    });

    // Type into the search box
    await user.type(searchInput, "alice");

    await waitFor(() =>
      expect(mockListAdminUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "alice" }),
        "test-admin-token",
      ),
    );
  });

  it("filters the displayed list when a search term is active", async () => {
    const user = userEvent.setup();

    // Default mock returns both alice and bob.
    // When called with search="alice" it returns only alice.
    mockListAdminUsers.mockImplementation(async (query) => {
      if (query.search === "alice") {
        return makeResponse([makeUser({ id: "user-1", username: "alice" })]);
      }
      return makeResponse([
        makeUser({ id: "user-1", username: "alice" }),
        makeUser({ id: "user-2", username: "bob" }),
      ]);
    });

    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByText("bob")).toBeInTheDocument();

    const searchInput = screen.getByRole("searchbox", {
      name: /search by wallet address or username/i,
    });
    await user.type(searchInput, "alice");

    // Wait for bob to disappear once the filtered fetch settles.
    await waitFor(() =>
      expect(screen.queryByText("bob")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("resets to page 1 when the search term changes", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(mockListAdminUsers).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByRole("searchbox", {
      name: /search by wallet address or username/i,
    });
    await user.type(searchInput, "x");

    await waitFor(() =>
      expect(mockListAdminUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 }),
        "test-admin-token",
      ),
    );
  });

  it("shows 'No users found' when the server returns an empty list", async () => {
    mockListAdminUsers.mockResolvedValue(makeResponse([]));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no users found/i)).toBeInTheDocument(),
    );
  });

  it("shows an error message when the fetch fails", async () => {
    mockListAdminUsers.mockRejectedValue(new Error("Network error"));
    await renderPage();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument(),
    );
  });

  // ── Ban action ─────────────────────────────────────────────────────────────

  it("opens the ban confirm dialog when Ban is clicked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    const banButton = screen.getByRole("button", { name: /ban alice/i });
    await user.click(banButton);

    expect(
      screen.getByRole("heading", { name: /ban alice/i }),
    ).toBeInTheDocument();
  });

  it("disables the Ban confirm button until a reason is entered", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /ban alice/i }));

    const confirmBtn = screen.getByRole("button", { name: /ban user/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("enables the Ban confirm button once a reason is typed", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /ban alice/i }));

    const reasonField = screen.getByLabelText(/reason for ban/i);
    await user.type(reasonField, "Spam activity");

    const confirmBtn = screen.getByRole("button", { name: /ban user/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls banAdminUser with the entered reason on confirm", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /ban alice/i }));
    await user.type(screen.getByLabelText(/reason for ban/i), "Spam activity");
    await user.click(screen.getByRole("button", { name: /ban user/i }));

    await waitFor(() =>
      expect(mockBanAdminUser).toHaveBeenCalledWith(
        "user-1",
        "Spam activity",
        "test-admin-token",
      ),
    );
  });

  it("does not call banAdminUser when Cancel is clicked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /ban alice/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(mockBanAdminUser).not.toHaveBeenCalled();
  });

  // ── Unban action ───────────────────────────────────────────────────────────

  it("opens the unban confirm dialog when Unban is clicked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("bob")).toBeInTheDocument());

    const unbanButton = screen.getByRole("button", { name: /unban bob/i });
    await user.click(unbanButton);

    expect(
      screen.getByRole("heading", { name: /unban bob/i }),
    ).toBeInTheDocument();
  });

  it("does NOT require a reason for unban — confirm is enabled immediately", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("bob")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /unban bob/i }));

    const confirmBtn = screen.getByRole("button", { name: /unban user/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls unbanAdminUser on confirm", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("bob")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /unban bob/i }));
    await user.click(screen.getByRole("button", { name: /unban user/i }));

    await waitFor(() =>
      expect(mockUnbanAdminUser).toHaveBeenCalledWith(
        "user-2",
        "test-admin-token",
      ),
    );
  });

  // ── Flag action ────────────────────────────────────────────────────────────

  it("opens the flag confirm dialog when Flag is clicked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    const flagButton = screen.getByRole("button", {
      name: /flag alice for review/i,
    });
    await user.click(flagButton);

    expect(
      screen.getByRole("heading", { name: /flag alice/i }),
    ).toBeInTheDocument();
  });

  it("flag action requires a reason — confirm disabled when reason is empty", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );

    const confirmBtn = screen.getByRole("button", { name: /submit flag/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("flag action requires a non-empty reason — whitespace-only is rejected", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );

    const reasonField = screen.getByLabelText(/reason for flag/i);
    await user.type(reasonField, "   "); // whitespace only

    const confirmBtn = screen.getByRole("button", { name: /submit flag/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("flag action enables confirm once a reason is entered", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );

    const reasonField = screen.getByLabelText(/reason for flag/i);
    await user.type(reasonField, "Suspicious activity");

    const confirmBtn = screen.getByRole("button", { name: /submit flag/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls flagAdminUser with the entered reason on confirm", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );
    await user.type(
      screen.getByLabelText(/reason for flag/i),
      "Suspicious activity",
    );
    await user.click(screen.getByRole("button", { name: /submit flag/i }));

    await waitFor(() =>
      expect(mockFlagAdminUser).toHaveBeenCalledWith(
        "user-1",
        "Suspicious activity",
        "test-admin-token",
      ),
    );
  });

  it("does not call flagAdminUser when Cancel is clicked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(mockFlagAdminUser).not.toHaveBeenCalled();
  });

  // ── Reason resets between opens ────────────────────────────────────────────

  it("clears the reason field when dialog is reopened after cancel", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    // Open, type, cancel
    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );
    await user.type(screen.getByLabelText(/reason for flag/i), "First reason");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    // Reopen — textarea should be empty
    await user.click(
      screen.getByRole("button", { name: /flag alice for review/i }),
    );
    const textarea = screen.getByLabelText(/reason for flag/i);
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  // ── AdminGuard wrapping ────────────────────────────────────────────────────

  it("renders the admin page content (AdminGuard bypassed in tests)", async () => {
    await renderPage();
    expect(
      screen.getByTestId("admin-users-page"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ConfirmDialog standalone unit tests — reason required logic
// ---------------------------------------------------------------------------

import { render as renderComponent } from "@testing-library/react";
import { ConfirmDialog } from "@/component/ui/confirm-dialog";

describe("ConfirmDialog — reason required logic", () => {
  it("confirm button is enabled when no reasonLabel is set", () => {
    renderComponent(
      <ConfirmDialog
        open={true}
        title="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /^confirm$/i }),
    ).not.toBeDisabled();
  });

  it("confirm button is disabled when reasonLabel is set and textarea is empty", () => {
    renderComponent(
      <ConfirmDialog
        open={true}
        title="Flag user?"
        reasonLabel="Reason"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();
  });

  it("confirm button becomes enabled once reason textarea has content", async () => {
    const user = userEvent.setup();
    renderComponent(
      <ConfirmDialog
        open={true}
        title="Flag user?"
        reasonLabel="Reason"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/reason/i), "Bad actor");
    expect(screen.getByRole("button", { name: /^confirm$/i })).not.toBeDisabled();
  });

  it("passes the trimmed reason to onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderComponent(
      <ConfirmDialog
        open={true}
        title="Flag user?"
        reasonLabel="Reason"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/reason/i), "  Bad actor  ");
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(onConfirm).toHaveBeenCalledWith("Bad actor");
  });

  it("calls onConfirm with undefined when no reasonLabel is set", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderComponent(
      <ConfirmDialog
        open={true}
        title="Are you sure?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderComponent(
      <ConfirmDialog
        open={true}
        title="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
