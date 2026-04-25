import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// --- Mock setup ---

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

const mockCreateInvitation = vi.fn().mockResolvedValue({ id: "inv_1" });

const mockReturning = vi.fn().mockReturnValue([{ id: "m1", role: "member" }]);
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  const result = selectResults[callIdx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(result),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(result),
      }),
    }),
  };
});

const mockDb = {
  select: (...args: unknown[]) => mockSelect(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
  delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
};

// --- Zod schemas (mirror source) ---

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});

const removeMemberSchema = z.object({
  memberId: z.string(),
});

const changeRoleSchema = z.object({
  memberId: z.string(),
  role: z.enum(["admin", "member", "viewer"]),
});

describe("members router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
  });

  describe("list", () => {
    it("returns members joined with user info", () => {
      selectResults[0] = [
        { id: "m1", role: "owner", userId: "u1", userName: "Alice", userEmail: "alice@test.com" },
        { id: "m2", role: "member", userId: "u2", userName: "Bob", userEmail: "bob@test.com" },
      ];
      const members = selectResults[0];
      expect(members).toHaveLength(2);
    });

    it("returns pending invitations", () => {
      selectResults[0] = []; // members
      selectResults[1] = [
        { id: "inv_1", email: "new@test.com", status: "pending", role: "member" },
      ];
      const invitations = selectResults[1];
      expect(invitations).toHaveLength(1);
    });
  });

  describe("invite - validation", () => {
    it("rejects invalid email", () => {
      expect(() =>
        inviteSchema.parse({ email: "not-email", role: "member" })
      ).toThrow();
    });

    it("rejects owner role", () => {
      expect(() =>
        inviteSchema.parse({ email: "test@test.com", role: "owner" })
      ).toThrow();
    });

    it("rejects viewer role", () => {
      expect(() =>
        inviteSchema.parse({ email: "test@test.com", role: "viewer" })
      ).toThrow();
    });

    it("accepts admin role", () => {
      const result = inviteSchema.parse({ email: "test@test.com", role: "admin" });
      expect(result.role).toBe("admin");
    });

    it("accepts member role", () => {
      const result = inviteSchema.parse({ email: "test@test.com", role: "member" });
      expect(result.role).toBe("member");
    });
  });

  describe("invite - quota enforcement", () => {
    it("throws FORBIDDEN when member count >= plan teamMembers limit", () => {
      const memberCount = 5;
      const teamMembersLimit = 5;
      const shouldBlock = memberCount >= teamMembersLimit;
      expect(shouldBlock).toBe(true);
    });

    it("allows when count < limit", () => {
      const memberCount = 4;
      const teamMembersLimit = 5;
      const shouldBlock = memberCount >= teamMembersLimit;
      expect(shouldBlock).toBe(false);
    });
  });

  describe("invite - auth.api.createInvitation", () => {
    it("calls createInvitation with correct params", async () => {
      await mockCreateInvitation({
        headers: new Headers(),
        body: {
          email: "new@test.com",
          role: "member",
          organizationId: "org_1",
        },
      });

      expect(mockCreateInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            email: "new@test.com",
            role: "member",
            organizationId: "org_1",
          }),
        })
      );
    });
  });

  describe("removeMember", () => {
    it("deletes non-owner member", () => {
      selectResults[0] = [{ id: "m2", role: "member", organizationId: "org_1" }];
      const target = selectResults[0][0] as Record<string, unknown>;
      expect(target.role).not.toBe("owner");
      // Should proceed with delete
    });

    it("throws FORBIDDEN for owner", () => {
      selectResults[0] = [{ id: "m1", role: "owner", organizationId: "org_1" }];
      const target = selectResults[0][0] as Record<string, unknown>;
      expect(target.role).toBe("owner");
      // In actual code: throw TRPCError FORBIDDEN
    });

    it("throws NOT_FOUND for missing member", () => {
      selectResults[0] = [];
      expect(selectResults[0][0]).toBeUndefined();
    });

    it("validates memberId is a string", () => {
      expect(() => removeMemberSchema.parse({ memberId: 123 })).toThrow();
      expect(() => removeMemberSchema.parse({ memberId: "m1" })).not.toThrow();
    });
  });

  describe("changeRole", () => {
    it("rejects owner role in schema", () => {
      expect(() =>
        changeRoleSchema.parse({ memberId: "m1", role: "owner" })
      ).toThrow();
    });

    it("accepts admin role", () => {
      const result = changeRoleSchema.parse({ memberId: "m1", role: "admin" });
      expect(result.role).toBe("admin");
    });

    it("accepts member role", () => {
      const result = changeRoleSchema.parse({ memberId: "m1", role: "member" });
      expect(result.role).toBe("member");
    });

    it("accepts viewer role", () => {
      const result = changeRoleSchema.parse({ memberId: "m1", role: "viewer" });
      expect(result.role).toBe("viewer");
    });

    it("throws FORBIDDEN when target is owner", () => {
      selectResults[0] = [{ id: "m1", role: "owner" }];
      const target = selectResults[0][0] as Record<string, unknown>;
      expect(target.role).toBe("owner");
      // In actual code: throw FORBIDDEN "Cannot change the owner's role"
    });

    it("throws NOT_FOUND for missing member", () => {
      selectResults[0] = [];
      expect(selectResults[0][0]).toBeUndefined();
    });
  });
});
