import { describe, expect, it, vi } from "vitest";
import { createTeamService } from "../src/modules/teams/team.service.js";

const team = { id: 7, name: "Platform Engineering", role: "owner" };

describe("workspace membership", () => {
  it("adds an existing verified account by email", async () => {
    const repository = {
      findForUser: vi.fn().mockResolvedValue(team),
      findVerifiedUserByEmail: vi.fn().mockResolvedValue({ id: 44, email: "person@example.com" }),
      addMembership: vi.fn().mockResolvedValue({ team_id: 7, user_id: 44, role: "responder" }),
    };
    const service = createTeamService({}, repository, { sendInvitationEmail: vi.fn() });
    const result = await service.addMember(7, 1, "PERSON@example.com", "responder");
    expect(repository.findVerifiedUserByEmail).toHaveBeenCalledWith("person@example.com");
    expect(result).toEqual({ team_id: 7, user_id: 44, role: "responder" });
  });

  it("emails an invitation to an address without a verified account", async () => {
    const sendInvitationEmail = vi.fn().mockResolvedValue(undefined);
    const invitation = { id: 9, team_id: 7, email: "new@example.com", role: "viewer", invitationPending: true };
    const repository = {
      findForUser: vi.fn().mockResolvedValue(team),
      findVerifiedUserByEmail: vi.fn().mockResolvedValue(null),
      createInvitation: vi.fn().mockResolvedValue(invitation),
    };
    const service = createTeamService({}, repository, { sendInvitationEmail });
    const result = await service.addMember(7, 1, "new@example.com", "viewer");
    expect(sendInvitationEmail).toHaveBeenCalledWith("new@example.com", "Platform Engineering", "viewer");
    expect(result.invitationPending).toBe(true);
  });

  it("does not allow a viewer to invite or add members", async () => {
    const repository = { findForUser: vi.fn().mockResolvedValue({ ...team, role: "viewer" }) };
    const service = createTeamService({}, repository, { sendInvitationEmail: vi.fn() });
    await expect(service.addMember(7, 5, "person@example.com", "responder"))
      .rejects.toMatchObject({ status: 403, code: "INSUFFICIENT_TEAM_PERMISSIONS" });
  });
});
