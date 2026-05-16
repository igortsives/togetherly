import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sources/scheduler", () => ({
  refreshAllStaleSources: vi.fn()
}));

import { refreshAllStaleSources } from "@/lib/sources/scheduler";
import { GET } from "./route";

const mockDispatch = refreshAllStaleSources as unknown as ReturnType<
  typeof vi.fn
>;

const ORIGINAL_SECRET = process.env.SCHEDULER_SECRET;

beforeEach(() => {
  vi.resetAllMocks();
  mockDispatch.mockResolvedValue({
    examined: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    results: []
  });
  process.env.SCHEDULER_SECRET = "test-secret-32-chars-or-whatever";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.SCHEDULER_SECRET;
  } else {
    process.env.SCHEDULER_SECRET = ORIGINAL_SECRET;
  }
});

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/internal/refresh-sources", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : undefined
  });
}

describe("GET /api/internal/refresh-sources", () => {
  it("returns 503 when SCHEDULER_SECRET is not configured", async () => {
    delete process.env.SCHEDULER_SECRET;
    const response = await GET(
      makeRequest("Bearer test-secret-32-chars-or-whatever")
    );
    expect(response.status).toBe(503);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 when no Authorization header is supplied", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on the wrong scheme", async () => {
    const response = await GET(
      makeRequest("Basic dGVzdC1zZWNyZXQtMzItY2hhcnMtb3Itd2hhdGV2ZXI=")
    );
    expect(response.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on a wrong secret", async () => {
    const response = await GET(makeRequest("Bearer nope-not-it"));
    expect(response.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on an empty Bearer value", async () => {
    const response = await GET(makeRequest("Bearer "));
    expect(response.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("invokes the dispatcher and returns the summary when the secret matches", async () => {
    mockDispatch.mockResolvedValue({
      examined: 3,
      attempted: 3,
      succeeded: 2,
      failed: 1,
      results: [
        {
          sourceId: "s1",
          familyId: "f1",
          status: "ok",
          changeDetected: false
        },
        {
          sourceId: "s2",
          familyId: "f1",
          status: "ok",
          changeDetected: true
        },
        {
          sourceId: "s3",
          familyId: "f2",
          status: "error",
          error: "boom"
        }
      ]
    });

    const response = await GET(
      makeRequest("Bearer test-secret-32-chars-or-whatever")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.examined).toBe(3);
    expect(body.results).toHaveLength(3);
    expect(mockDispatch).toHaveBeenCalledWith();
  });
});

