# flamenco-stable-output-jobtypes

Custom Flamenco job types that enable **stable render output directories** and **overwrite-friendly workflows**, designed for small studios and editorial pipelines (for example, DaVinci Resolve working with many EXR sequences).

These job types do **not modify Flamenco core**. They demonstrate how Flamenco can support both iterative overwrite workflows and classic non-destructive render-farm layouts using custom job definitions.

## Problem this solves

Flamenco’s default behavior always creates a timestamped output directory per submission.  
This is ideal for non-destructive rendering, but it introduces friction in workflows where:

- Many image sequences are linked into an editor (Resolve, Nuke, After Effects)
- Artists want to iterate and **overwrite renders in place**
- Re-importing or re-linking media is costly
- Small teams work directly from shared storage

These job types provide explicit, opt-in solutions for those cases while keeping Flamenco’s default behavior available.

## Included job types

### BeFrames_BlenderPath

**Purpose:** overwrite-friendly editorial workflow.

- Renders directly into Blender’s configured output directory (`scene.render.filepath`)
- Preserves Blender’s filename prefix and appends frame padding (`_######`)
- Optional **Stable Directory**
  - **ON**: render to the same folder every submission (overwrite workflow)
  - **OFF**: create a timestamp subfolder per submission (non-destructive)
- Optional **Force Overwrite**
  - Programmatically enables Blender’s overwrite behavior to prevent “Frame Skipped” when files already exist
  - Implemented via a Python expression executed after loading the `.blend` but before rendering frames
- Intended for iterative workflows where sequences must update automatically in an editor

### BeFrames_RootBased

**Purpose:** classic centralized render-farm output layout.

- Ignores Blender’s output directory and renders under a user-defined **Render Output Root**
- Optional **Add Path Components**
  - Appends the last N folders of the `.blend` file’s location under the render root to preserve project structure
- Output structure:
  - Render Output Root
  - Optional derived path components
  - Job name
  - Optional timestamp folder
  - Image sequence
- Optional **Stable Directory**
  - **ON**: stable folder per job (overwrite-friendly)
  - **OFF**: timestamped folders per submission (recommended for versioned outputs)
- Optional **Force Overwrite**, typically used only when stable directories are enabled

## Key technical notes

- Both job types support **image sequences only** (video formats are explicitly rejected)
- Overwrite behavior is enforced programmatically because Flamenco runs Blender in background mode, where UI state cannot be relied upon
- Output paths are computed deterministically inside the job types, allowing stable directories when desired instead of always forcing timestamped folders
- Conditional UI logic is intentionally avoided, as it is not reliably supported in Flamenco; instead, workflows are split into two explicit job types for clarity

## Installation

1. Copy the desired `.js` job type file into Flamenco’s `job-types` directory
2. Restart Flamenco Manager
3. Select the job type when submitting a render

No changes to Flamenco core are required.

## Intended audience

- Small studios
- Freelancers
- Teams working directly from shared storage
- Editorial-driven pipelines where overwrite workflows are necessary

## Disclaimer

These job types are provided as examples of how Flamenco can support stable-directory and overwrite-based workflows.  
They are not official Flamenco job types and do not modify Flamenco core behavior.
