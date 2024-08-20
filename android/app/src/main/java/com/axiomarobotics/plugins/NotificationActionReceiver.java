package com.axiomarobotics.plugins;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.IBinder;
import android.util.Log;

public class NotificationActionReceiver extends Service {
    private static final String TAG = "ReservationService";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "NotificationActionReceiver started//////////////////////////////////555555555555");
        notifyReservation();
        return START_STICKY;
    }


    // Método para manejar la reserva
    public void notifyReservation() {
        try {
            SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
            String id_viaje = prefs.getString("id_viaje", "0");
            String id_taxista = prefs.getString("id_taxista", "0");
            String tipo = prefs.getString("tipo", "0");

            // Aquí puedes manejar la lógica cuando se recibe la notificación y se presiona "Aceptar"
            Log.d(TAG, "Id de viaje :::::::::::" + id_viaje);
            Log.d(TAG, "Id de taxista :::::::::::" + id_taxista);
            Log.d(TAG, "Tipo :::::::::::" + tipo);

            // Aquí puedes manejar la lógica para enviar los datos a un servidor, etc.

        } catch (Exception e) {
            e.printStackTrace();
            Log.e(TAG, "Error al obtener los datos de Preferences", e);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}