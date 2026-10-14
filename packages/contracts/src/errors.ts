/** Every API error has this shape. `code` is stable and translated by the UI. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    issues?: { path: string; message: string }[];
  };
}
