package cloud.heiss.dashboard.microsoft.model;

/** Request to add an accessible OneDrive folder as a photo source by path. */
public record FolderRequest(String path) {
}