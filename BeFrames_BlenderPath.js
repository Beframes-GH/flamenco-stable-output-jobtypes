// SPDX-License-Identifier: GPL-3.0-or-later
// BeFrames_BlenderPath
//
// Purpose:
// - Renders EXACTLY into Blender's configured Output Path directory (scene.render.filepath).
// - Best for editorial pipelines (DaVinci Resolve) where you want a stable path and automatic updates.
//
// Key idea:
// - Blender decides the folder (full path).
// - Blender decides the filename prefix (e.g. Anim03_).
// - Flamenco distributes frames and (optionally) versions output into timestamp folders.

const JOB_TYPE = {
  label: "BeFrames_BlenderPath_v8",
  description: "Render to Blender Output Path (best for Resolve overwrite workflow)",
  settings: [
    {
      key: "frames",
      type: "string",
      required: true,
      eval: "f'{C.scene.frame_start}-{C.scene.frame_end}'",
      evalInfo: {
        showLinkButton: true,
        description: "Scene frame range",
      },
      description: "Frame range to render. Examples: '47', '1-30', '3, 5-10, 47-327'",
    },
    {
      key: "chunk_size",
      type: "int32",
      default: 20,
      visible: "submission",
      description:
        "Number of frames per task. Higher = fewer tasks (less overhead), lower = better distribution across workers.",
    },

    {
      key: "force_overwrite",
      type: "bool",
      default: true,
      visible: "submission",
      description:
        "Force Overwrite: when enabled, Blender will overwrite existing frames instead of skipping them (prevents 'Frame Skipped').",
    },
    {
      key: "stable_directory",
      type: "bool",
      default: true,
      visible: "submission",
      description:
        "Stable Directory: ON = render into the SAME folder every time (Resolve-friendly). OFF = create a timestamp folder per submission (versioned renders).",
    },

    // Output path:
    // Stable ON:
    //   <BlenderOutputDir>\<Prefix>_######
    // Stable OFF:
    //   <BlenderOutputDir>\{timestamp}\<Prefix>_######
    {
      key: "render_output_path",
      type: "string",
      subtype: "file_path",
      editable: false,
      eval:
        "str(Path(Path(C.scene.render.filepath).parent, Path(C.scene.render.filepath).name + '_######')) "
        + "if settings.stable_directory else "
        + "str(Path(Path(C.scene.render.filepath).parent, '{timestamp}', Path(C.scene.render.filepath).name + '_######'))",
      description:
        "Final render output path (computed). Uses Blender's output directory, optionally adding a timestamp folder.",
    },

    { key: "blendfile", type: "string", required: true, visible: "web" },
    { key: "scene", type: "string", required: true, eval: "C.scene.name", visible: "web" },
    { key: "format", type: "string", required: true, eval: "C.scene.render.image_settings.file_format", visible: "web" },
    { key: "image_file_extension", type: "string", eval: "C.scene.render.file_extension", visible: "hidden" },
    { key: "fps", type: "float", eval: "C.scene.render.fps / C.scene.render.fps_base", visible: "hidden" },
  ],
};

const videoFormats = ["FFMPEG", "AVI_RAW", "AVI_JPEG"];

function compileJob(job) {
  const settings = job.settings;

  if (videoFormats.includes(settings.format)) {
    throw "Video formats are not supported by this job type (image sequences only).";
  }

  const renderOutput = renderOutputPath(job);
  settings.render_output_path = renderOutput;

  const renderDir = path.dirname(renderOutput);
  const tasks = authorRenderTasks(settings, renderDir, renderOutput);

  for (const task of tasks) job.addTask(task);
}

function renderOutputPath(job) {
  let p = job.settings.render_output_path;
  return p.replace(/{([^}]+)}/g, (match, key) =>
    key === "timestamp" ? formatTimestampLocal(job.created) : match
  );
}

function authorRenderTasks(settings, renderDir, renderOutput) {
  const tasks = [];
  const chunks = frameChunker(settings.frames, settings.chunk_size);

  const baseArgs = settings.scene ? ["--scene", settings.scene] : [];

  // IMPORTANT:
  // Must execute AFTER the blend is loaded, but BEFORE --render-frame triggers rendering.
  // So we inject this python-expr inside `args` BEFORE --render-frame.
  const overwriteArgs = settings.force_overwrite
    ? [
        "--python-expr",
        "import bpy\n"
          + "for s in bpy.data.scenes:\n"
          + "    s.render.use_overwrite = True\n"
          + "    s.render.use_placeholder = False\n",
      ]
    : [];

  for (const chunk of chunks) {
    const task = author.Task(`render-${chunk}`, "blender");

    const command = author.Command(
      "blender-render",
      {
        exe: "{blender}",
        exeArgs: "{blenderArgs}",
        blendfile: settings.blendfile,
        args: []
          .concat(baseArgs)
          .concat(overwriteArgs)
          .concat([
            "--render-output",
            path.join(renderDir, path.basename(renderOutput)),
            "--render-format",
            settings.format,
            "--render-frame",
            chunk.replaceAll("-", ".."),
          ]),
      },
      frameCount(chunk)
    );

    task.addCommand(command);
    tasks.push(task);
  }

  return tasks;
}
