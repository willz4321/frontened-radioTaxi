package com.axiomarobotics.plugins;

import android.Manifest;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import com.axiomarobotics.radiotaxi.R;

import org.json.JSONObject;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ForegroundLocationService extends Service implements LocationListener {
    private static final String CHANNEL_ID = "location_channel";
    private LocationManager locationManager;
    private final OkHttpClient client = new OkHttpClient();

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000, 0, this);
            }
        }
    }
    private int getUserId() {
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        String userIdString = prefs.getString("userId", "0"); // Obtiene el valor como cadena
        try {
            return Integer.parseInt(userIdString); // Convierte la cadena a entero
        } catch (NumberFormatException e) {
            e.printStackTrace();
            return 0; // Valor predeterminado en caso de error
        }
    }
    @Override
    public void onLocationChanged(Location location) {
        // Obtener el ID del usuario desde Preferences
        int userId = getUserId();

        if (userId != 0) {
            // Enviar la ubicación al servidor
            sendLocationToServerWithUserId(userId, location.getLatitude(), location.getLongitude());
            System.out.println("Id de usuario es: " + userId);
        } else {
            System.err.println("ID de usuario no encontrado en Preferences");
        }
    }
    private void sendLocationToServerWithUserId(int userId, double latitude, double longitude) {
        // Crear el JSON payload
        JSONObject jsonPayload = new JSONObject();
        try {
            jsonPayload.put("id_usuario", userId);
            jsonPayload.put("latitude", latitude);
            jsonPayload.put("longitude", longitude);
        } catch (Exception e) {
            e.printStackTrace();
            return;
        }

        // Crear el cuerpo de la solicitud
        RequestBody body = RequestBody.create(jsonPayload.toString(), MediaType.get("application/json; charset=utf-8"));

        // Construir la solicitud HTTP
        Request request = new Request.Builder()
                .url(getServerUrl())
                .post(body)
                .build();

        // Ejecutar la solicitud en un hilo separado
        new Thread(() -> {
            try (Response response = client.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    String responseData = response.body().string();
                    System.out.println("Respuesta del servidor: " + responseData);
                } else {
                    System.err.println("Error en la solicitud: " + response.message());
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();
    }

    private String getServerUrl() {
        return "https://radiotaxi.axiomarobotics.com:10000/api/geolocation/update-location";
    }

    private Notification getNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "Location Service Channel";
            String description = "Channel for location service";
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }

        // Crear la notificación
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Servicio de Localizacion")
                .setContentText("Corriendo...")
                .setSmallIcon(R.mipmap.ic_launcher)
                .build();
    }
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(1, getNotification());
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        locationManager.removeUpdates(this);
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}
}
