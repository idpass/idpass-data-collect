/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { cloneDeep } from "lodash";
import { EntityDoc, EntityPair, EventApplier, FormSubmission } from "../interfaces/types";
import { AppError } from "../utils/AppError";

interface AttendanceSession {
  sessionId: string;
  groupGuid?: string;
  programId?: string;
  date: string;
  status: string;
  formGuid: string;
}

interface GroupOrProgramStats {
  sessions: number;
  attended: number;
  excused: number;
  absent: number;
  late: number;
}

interface AttendanceData {
  sessions: AttendanceSession[];
  totalSessions: number;
  attended: number;
  excused: number;
  absent: number;
  late: number;
  lastAttended: string | null;
  byGroup: Record<string, GroupOrProgramStats>;
  byProgram: Record<string, GroupOrProgramStats>;
}

function deriveGroupOrProgramStats(sessions: AttendanceSession[], key: "groupGuid" | "programId"): Record<string, GroupOrProgramStats> {
  const result: Record<string, GroupOrProgramStats> = {};

  for (const session of sessions) {
    const id = session[key];
    if (!id) continue;

    if (!result[id]) {
      result[id] = { sessions: 0, attended: 0, excused: 0, absent: 0, late: 0 };
    }
  }

  for (const id of Object.keys(result)) {
    const grouped = sessions.filter((s) => s[key] === id);
    result[id].sessions = grouped.length;
    result[id].attended = grouped.filter((s) => s.status === "present" || s.status === "late").length;
    result[id].excused = grouped.filter((s) => s.status === "excused").length;
    result[id].absent = grouped.filter((s) => s.status === "absent").length;
    result[id].late = grouped.filter((s) => s.status === "late").length;
  }

  return result;
}

export const attendanceEventApplier: EventApplier = {
  async apply(
    entity: EntityDoc,
    form: FormSubmission,
    _getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      changes: Record<string, any>,
    ) => Promise<void>,
  ): Promise<EntityDoc> {
    // Phantom entity guard: version 0 means the entity was not found in the store
    if (entity.version === 0) {
      throw new AppError("ENTITY_NOT_FOUND", "Individual not found in entity store");
    }

    // Clone entity to work on, leaving the original untouched
    const mutated = cloneDeep(entity);

    // Initialize attendance structure if not present
    if (!mutated.data.attendance) {
      mutated.data.attendance = {
        sessions: [],
        totalSessions: 0,
        attended: 0,
        excused: 0,
        absent: 0,
        late: 0,
        lastAttended: null,
        byGroup: {},
        byProgram: {},
      } as AttendanceData;
    }

    const attendance = mutated.data.attendance as AttendanceData;
    const sessions = attendance.sessions;

    // Idempotent replay: if this form has already been applied, return the original entity untouched
    const alreadyApplied = sessions.some((s) => s.formGuid === form.guid);
    if (alreadyApplied) {
      return entity;
    }

    const { sessionId, groupGuid, programId, date, status } = form.data as {
      sessionId: string;
      groupGuid?: string;
      programId?: string;
      date: string;
      status: string;
    };

    // Add session entry to log
    sessions.push({
      sessionId,
      groupGuid,
      programId,
      date,
      status,
      formGuid: form.guid,
    });

    // Derive all counters from the full session log (not incremental)
    attendance.totalSessions = sessions.length;
    attendance.attended = sessions.filter((s) => s.status === "present" || s.status === "late").length;
    attendance.excused = sessions.filter((s) => s.status === "excused").length;
    attendance.absent = sessions.filter((s) => s.status === "absent").length;
    attendance.late = sessions.filter((s) => s.status === "late").length;

    // Derive lastAttended by sorting attended session dates and picking the latest
    const attendedDates = sessions
      .filter((s) => s.status === "present" || s.status === "late")
      .map((s) => s.date)
      .sort();
    attendance.lastAttended = attendedDates.length > 0 ? attendedDates[attendedDates.length - 1] : null;

    // Derive per-group and per-program stats from the session log
    attendance.byGroup = deriveGroupOrProgramStats(sessions, "groupGuid");
    attendance.byProgram = deriveGroupOrProgramStats(sessions, "programId");

    // Increment version and update timestamp
    mutated.version += 1;
    mutated.lastUpdated = new Date().toISOString();

    // Save: pass original entity as "before", clone as "after"
    await saveEntity("record-attendance", entity, mutated, form.data);

    return mutated;
  },
};
