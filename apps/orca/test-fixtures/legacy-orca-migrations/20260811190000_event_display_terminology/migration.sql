ALTER TABLE "Event"
  ADD COLUMN "agendaTerm" TEXT,
  ADD COLUMN "runOfShowTerm" TEXT,
  ADD COLUMN "matrixTerm" TEXT,
  ADD COLUMN "showFlowTerm" TEXT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_agendaTerm_approved_check" CHECK ("agendaTerm" IS NULL OR "agendaTerm" IN ('Agenda', 'Run of Show', 'Matrix', 'Show Flow')),
  ADD CONSTRAINT "Event_runOfShowTerm_approved_check" CHECK ("runOfShowTerm" IS NULL OR "runOfShowTerm" IN ('Agenda', 'Run of Show', 'Matrix', 'Show Flow')),
  ADD CONSTRAINT "Event_matrixTerm_approved_check" CHECK ("matrixTerm" IS NULL OR "matrixTerm" IN ('Agenda', 'Run of Show', 'Matrix', 'Show Flow')),
  ADD CONSTRAINT "Event_showFlowTerm_approved_check" CHECK ("showFlowTerm" IS NULL OR "showFlowTerm" IN ('Agenda', 'Run of Show', 'Matrix', 'Show Flow'));
