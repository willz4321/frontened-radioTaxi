package com.axiomarobotics.radiotaxi;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.axiomarobotics.plugins.ForegroundLocationService ;
import com.axiomarobotics.plugins.NotificationActionReceiver;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutionException;
import java.util.prefs.Preferences;

public class MainActivity extends BridgeActivity implements LocationListener {
    private static final String TAG = "MainActivity";
    private static final int LONG_PRESS_DELAY = 3000; // 3 segundos
    private boolean isVolumeButtonPressed = false;
    private Handler handler = new Handler();
    private LocationManager locationManager;
    private double latitude;
    private double longitude;
    private boolean isNotificationPermissionGranted = false;
    private static final String CHANNEL_ID = "radiotaxi_channel";

    private Runnable longPressRunnable = new Runnable() {
        @Override
        public void run() {
            if (isVolumeButtonPressed) {
                isVolumeButtonPressed = false;
                Log.d(TAG, "Volume Up button long press detected");
                requestLocationAndSendPanicAlert();

            }

        }
    };
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "RadioTaxi Channel";
            String description = "Channel for RadioTaxi notifications";
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }
    public void showNotification(String title, String content) {
        System.out.println("Llanado a show notificacion////////////////////////////////");
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(content)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(this);
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Notification permissions are not granted");
            return;
        }
        notificationManager.notify(1, builder.build());
    }
    @Override
    public void onLocationChanged(Location location) {
        latitude = location.getLatitude();
        longitude = location.getLongitude();
        Log.d(TAG, "Localizacion en tiempo real: Latitude: " + latitude + ", Longitude: " + longitude);

    }
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();

        // Inicializar volumen para STREAM_MUSIC
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        Log.d(TAG, "MainActivity created");

        try {
            // Verificar y solicitar permisos de ubicación si es necesario
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
            } else {
                Log.d(TAG, "Location permissions already granted");
                initializeLocationManager(); // Método para inicializar el LocationManager
                startForegroundService(); // Inicia el servicio en primer plano
            }

            // Verificar y solicitar permisos de notificación (Android 13+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2);
                } else {
                    Log.d(TAG, "Notification permissions already granted((((((((((((((((((()))))))))))))))))))))))))))))))");

                }
            } else {
                Log.d(TAG, "Notification permissions already granted((((((((((((((((((()))))))))))))))))))))))))))))))");

            }


        } catch (Exception e) {
            Log.e(TAG, "Error in onCreate", e);
        }
    }

    public void startNotifyReservation() {
        Intent serviceIntent = new Intent(this, NotificationActionReceiver.class);

        // A partir de Android O (API 26), los servicios en segundo plano deben ser "foreground"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    private void initializeLocationManager() {
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);

        if (locationManager == null) {
            Log.e(TAG, "LocationManager is null, failed to initialize.");
            return;
        }

        // Verificar los permisos antes de solicitar actualizaciones de ubicación
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            try {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0, 0, this);
                Log.d(TAG, "LocationManager initialized with GPS_PROVIDER");
            } catch (Exception e) {
                Log.e(TAG, "Error while requesting location updates", e);
            }
        } else {
            Log.e(TAG, "Location permissions are not granted.");
        }
    }

    private void startForegroundService() {
        Intent serviceIntent = new Intent(this, ForegroundLocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == 2) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                isNotificationPermissionGranted = true;
            }
        }

        if (requestCode == 1) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // Inicializa el LocationManager si aún no está inicializado
                if (locationManager == null) {
                    initializeLocationManager(); // Asegúrate de que el LocationManager está correctamente inicializado
                }

                // Verifica si el locationManager no es nulo antes de intentar solicitar actualizaciones
                if (locationManager != null) {
                    try {
                        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0, 0, this);
                    } catch (SecurityException e) {
                        Log.e(TAG, "Location permission granted but SecurityException occurred", e);
                    }
                } else {
                    Log.e(TAG, "LocationManager is null after requesting permission.");
                }
            } else {
                Log.e(TAG, "Location permissions not granted.");
            }
        }
    }
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            if (!isVolumeButtonPressed) {
                isVolumeButtonPressed = true;
                handler.postDelayed(longPressRunnable, LONG_PRESS_DELAY);
                Log.d(TAG, "Volume Up button pressed");
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            if (isVolumeButtonPressed) {
                isVolumeButtonPressed = false;
                handler.removeCallbacks(longPressRunnable);
                Log.d(TAG, "Volume Up button released");
            }
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    private void requestLocationAndSendPanicAlert() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Location permissions are not granted");
            return;
        }
        Location location = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
        if (location != null) {
            latitude = location.getLatitude();
            longitude = location.getLongitude();
            Log.d(TAG, "Location obtained: Latitude: " + latitude + ", Longitude: " + longitude);
            sendPanicAlert();
        } else {
            Log.e(TAG, "Failed to obtain location");
        }
    }

    private void sendPanicAlert() {
        Log.d(TAG, "Sending panic alert");

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://radiotaxi.axiomarobotics.com:10000/api/geolocation/panic2");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);

                String jsonInputString = String.format("{\"latitude\": \"%s\", \"longitude\": \"%s\"}", latitude, longitude);
                Log.d(TAG, "Sending data: " + jsonInputString);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInputString.getBytes("utf-8");
                    os.write(input, 0, input.length);
                }

                int code = conn.getResponseCode();
                Log.d(TAG, "HTTP Response code: " + code);

                if (code == 200) {
                    // Leer la respuesta
                    InputStream inputStream = conn.getInputStream();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
                    StringBuilder response = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        response.append(line);
                    }
                    reader.close();
                    JSONObject jsonResponse = new JSONObject(response.toString());
                    String nearestUserId = jsonResponse.getString("nearestUser");
                    Log.d(TAG, "Nearest User ID: " + nearestUserId);

                    // Enviar alerta de pánico con el id_usuario del usuario más cercano
                    sendPanicAlertWithUserId(nearestUserId);
                } else {
                    Log.e(TAG, "HTTP Error: " + code);
                }

            } catch (Exception e) {
                Log.e(TAG, "Error sending panic alert", e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }

    private void sendPanicAlertWithUserId(String idUsuario) {
        Log.d(TAG, "Sending panic alert with user ID: " + idUsuario);

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://radiotaxi.axiomarobotics.com:10000/api/geolocation/panic");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);

                String jsonInputString = String.format("{\"id_usuario\": \"%s\"}", idUsuario);
                Log.d(TAG, "Sending data: " + jsonInputString);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInputString.getBytes("utf-8");
                    os.write(input, 0, input.length);
                }

                int code = conn.getResponseCode();
                Log.d(TAG, "HTTP Response code: " + code);

                if (code != 200) {
                    Log.e(TAG, "HTTP Error: " + code);
                }

            } catch (Exception e) {
                Log.e(TAG, "Error sending panic alert with user ID", e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}
}
