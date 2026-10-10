package cloud.heiss.dashboard.photos;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Media stream that releases its cache reader pin exactly once when closed. */
final class PinnedInputStream extends FilterInputStream {

    private final Runnable release;
    private boolean closed;

    PinnedInputStream(InputStream input, Runnable release) {
        super(input);
        this.release = release;
    }

    @Override
    public void close() throws IOException {
        if (closed) {
            return;
        }
        closed = true;
        try {
            super.close();
        } finally {
            release.run();
        }
    }
}