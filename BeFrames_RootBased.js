// SPDX-License-Identifier: GPL-3.0-or-later
// BeFrames_RootBased
//
// Purpose:
// - Renders into a central "farm output root" folder (ignores Blender's output DIRECTORY).
// - Useful when you want all farm renders centralized in one place for backups/cleanup/permissions.
//
// Key idea:
// - Flamenco decides the folder using:
//     Render Output Root + (optional) last N folders of the .blend path + jobname (+ optional timestamp)
// - Blender still provides the filename prefix (e.g. Anim03_).
//
// Example (stable):
//   Z:\FarmRenders\<last N folders>\MyJob\Anim03_000001.exr
// Example (timestamped):
//   Z:\FarmRenders\<last N folders>\MyJob\2025-12-18_10-12-33\Anim03_000001.exr

const JOB_TYPE = {
  label: "BeFrames_RootBased_v8",
  description: "Render to a central Render Output Root (classic farm output layout)",
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
      key: "render_output_root",
      type: "string",
      subtype: "dir_path",
      required: true,
      visible: "submission",
      description:
        "Render Output Root: the base folder where the farm writes renders (e.g. Z:\\FarmRenders). This job type ignores Blender's output DIRECTORY.",
    },
    {
      key: "add_path_components",
      type: "int32",
      default: 0,
      propargs: { min: 0, max: 32 },
      visible: "submission",
      description:
        "Add path components: appends the last N folders from the .blend file location under the Render Output Root (helps preserve project structure). 0 = no extra folders.",
    },

    {
      key: "force_overwrite",
      type: "bool",
      default: false,
      visible: "submission",
      description:
        "Force Overwrite: overwrite existing frames if they already exist. Usually you keep this OFF if you use timestamp folders (versioned renders).",
    },
    {
      key: "stable_directory",
      type: "bool",
      default: false,
      visible: "submission",
      description:
        "Stable Directory: ON = render into the SAME folder for the same jobname (overwrite workflow). OFF = create a timestamp folder per submission (recommended for versioned outputs).",
    },

    // Output path:
    // Stable ON:
    //   <Root>\<last_n_dir_parts>\<jobname>\<Prefix>_######
    // Stable OFF:
    //   <Root>\<last_n_dir_parts>\<jobname>\{timestamp}\<Prefix>_######
    {
      key: "render_output_path",
      type: "string",
      subtype: "file_path",
      editable: false,
      eval:
        "str(Path(abspath(settings.render_output_root), last_n_dir_parts(settings.add_path_components), jobname, Path(C.scene.render.filepath).name + '_######')) "
        + "if settings.stable_directory else "
        + "str(Path(abspath(settings.render_output_root), last_n_dir_parts(settings.add_path_components), jobname, '{timestamp}', Path(C.scene.render.filepath).name + '_######'))",
      description:
        "Final render output path (computed). Uses Render Output Root + optional blend-path components + jobname + optional timestamp folder.",
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

  if (!settings.render_output_root || `${settings.render_output_root}`.trim() === "") {
    throw "Render Output Root is required for the RootBased job type.";
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
