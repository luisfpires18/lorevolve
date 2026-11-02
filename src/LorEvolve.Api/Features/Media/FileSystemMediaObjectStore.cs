using Microsoft.AspNetCore.StaticFiles;

namespace LorEvolve.Api.Features.Media;

/// <summary>
/// Objects as files under one folder, for the desktop edition (ADR 0070): the buyer's disk holds their pictures.
///
/// Each object is written beside its key under a temporary name and renamed into place, so a half-written picture never
/// appears under its key. The content type is not stored: it is read back from the key's extension, and every key
/// LorEvolve writes ends in one (<c>original.png</c>, <c>thumbnail.webp</c>, ...). A key that would leave the folder is
/// refused.
/// </summary>
public sealed class FileSystemMediaObjectStore(string root) : IMediaObjectStore
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    private readonly string _root = Path.GetFullPath(root);

    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken cancellationToken)
    {
        var path = PathOf(key);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var partial = $"{path}.{Guid.NewGuid():N}.partial";
            await using (var file = File.Create(partial))
            {
                await content.CopyToAsync(file, cancellationToken);
            }

            File.Move(partial, path, overwrite: true);
        }
        catch (IOException exception)
        {
            throw new MediaStorageFailedException("The picture could not be saved to disk.", exception);
        }
        catch (UnauthorizedAccessException exception)
        {
            throw new MediaStorageFailedException("The picture could not be saved to disk.", exception);
        }
    }

    public Task<StoredMediaObject?> GetAsync(string key, CancellationToken cancellationToken)
    {
        var path = PathOf(key);
        if (!File.Exists(path))
        {
            return Task.FromResult<StoredMediaObject?>(null);
        }

        var contentType = ContentTypes.TryGetContentType(path, out var known) ? known : "application/octet-stream";
        var file = File.OpenRead(path);
        return Task.FromResult<StoredMediaObject?>(new StoredMediaObject(file, contentType, file.Length));
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        File.Delete(PathOf(key));
        return Task.CompletedTask;
    }

    private string PathOf(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_root, key));
        return path.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            ? path
            : throw new ArgumentException("A media key must stay inside the store.", nameof(key));
    }
}
