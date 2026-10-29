/**
 * v1.0 talks only to ComfyUI, which does not publish model metadata. Base-model
 * information therefore stays unknown unless the workflow itself carries it.
 */
export async function modelMetadata(
  _kind: string,
  _names: string[],
  current: () => boolean = () => true,
) {
  void current;
  return {} as Record<string, string>;
}
